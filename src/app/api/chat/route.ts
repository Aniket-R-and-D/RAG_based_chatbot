import dns from 'node:dns';
import { getSupabase } from '@/lib/supabase';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { LangChainAdapter } from 'ai';

dns.setDefaultResultOrder('ipv4first');

// ─── Tuned Configuration ──────────────────────────────────────
const RAG_HIGH = 0.75;           // High confidence — answer directly
const RAG_MEDIUM = 0.55;         // Medium confidence — answer with caveat
const LOG_THRESHOLD = 0.60;      // Log for admin review if below this
const TOP_K = 5;                 // Number of vector search results
const SUPABASE_TIMEOUT_MS = 6000;
const MAX_HISTORY_TURNS = 4;

export const maxDuration = 60;

// ─── In-Memory Response Cache (LRU-style) ─────────────────────
interface CacheEntry {
    answer: string;
    answerMode: string;
    timestamp: number;
}
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CACHE_MAX_SIZE = 100;
const responseCache = new Map<string, CacheEntry>();

function normalizeCacheKey(text: string): string {
    // Fuzzy normalization: lowercase, remove fillers/punctuation, collapse whitespace
    const stopWords = new Set([
        'how', 'what', 'where', 'when', 'why', 'which', 'who',
        'the', 'is', 'are', 'was', 'were', 'a', 'an', 'and', 'or',
        'to', 'in', 'on', 'for', 'of', 'with', 'do', 'does', 'did',
        'can', 'could', 'will', 'would', 'should', 'may', 'might',
        'i', 'my', 'me', 'we', 'you', 'it', 'this', 'that', 'these',
        'be', 'been', 'being', 'have', 'has', 'had', 'not', 'but',
        'if', 'then', 'so', 'from', 'at', 'by', 'about', 'up',
        'please', 'tell', 'explain', 'show', 'give',
    ]);
    return text.toLowerCase()
        .replace(/[^a-z0-9\s\u0980-\u09FF]/g, ' ')  // keep bengali chars
        .split(/\s+/)
        .filter(w => w.length > 1 && !stopWords.has(w))
        .sort()  // order-insensitive
        .join(' ')
        .trim();
}

function getCachedResponse(key: string): CacheEntry | null {
    const entry = responseCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        responseCache.delete(key);
        return null;
    }
    return entry;
}

function setCachedResponse(key: string, answer: string, answerMode: string) {
    if (responseCache.size >= CACHE_MAX_SIZE) {
        const oldest = responseCache.keys().next().value;
        if (oldest) responseCache.delete(oldest);
    }
    responseCache.set(key, { answer, answerMode, timestamp: Date.now() });
}

// ─── Language Detection ───────────────────────────────────────
function isEnglish(text: string): boolean {
    // If >60% of chars are ASCII letters, treat as English
    const asciiLetters = text.replace(/[^a-zA-Z]/g, '').length;
    const totalLetters = text.replace(/[\s\d\W]/g, '').length || 1;
    return (asciiLetters / totalLetters) > 0.6;
}

// ─── Keyword Reranking ────────────────────────────────────────
function extractKeywords(text: string): string[] {
    const stopWords = new Set([
        'how', 'what', 'where', 'when', 'why', 'which', 'who',
        'the', 'is', 'are', 'was', 'were', 'a', 'an', 'and', 'or',
        'to', 'in', 'on', 'for', 'of', 'with', 'do', 'does', 'did',
        'can', 'could', 'will', 'would', 'should', 'may', 'might',
        'i', 'my', 'me', 'we', 'you', 'it', 'this', 'that', 'these',
        'be', 'been', 'being', 'have', 'has', 'had', 'not', 'but',
        'if', 'then', 'so', 'from', 'at', 'by', 'about', 'up',
    ]);
    return text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));
}

function rerankWithKeywords(
    matches: { question: string; answer: string; similarity: number; content?: string }[],
    queryKeywords: string[]
): typeof matches {
    if (queryKeywords.length === 0) return matches;

    return matches
        .map(m => {
            const matchText = `${m.question} ${m.answer}`.toLowerCase();
            const keywordHits = queryKeywords.filter(kw => matchText.includes(kw)).length;
            const boost = Math.min(keywordHits * 0.03, 0.12);
            return { ...m, similarity: m.similarity + boost };
        })
        .sort((a, b) => b.similarity - a.similarity);
}

// ─── Latency Helper ───────────────────────────────────────────
function elapsed(start: number): string {
    return `${((performance.now() - start) / 1000).toFixed(2)}s`;
}

export async function POST(req: Request) {
    const requestStart = performance.now();

    try {
        const { messages, userId } = await req.json();

        // ─── Build conversation history for context ────────────
        const historyMessages = messages.slice(0, -1);
        const latestMessage = messages[messages.length - 1].content;

        const recentHistory = historyMessages.slice(-(MAX_HISTORY_TURNS * 2));
        const conversationHistory = recentHistory
            .map((m: { role: string; content: string }) =>
                `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
            )
            .join('\n');

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`💬 User asks: "${latestMessage}"`);
        console.log(`📜 History turns: ${recentHistory.length / 2}`);

        // ─── 0. Check Bengali-input cache first ───────────────
        const bengaliCacheKey = normalizeCacheKey(latestMessage);
        const bengaliCached = getCachedResponse(bengaliCacheKey);
        if (bengaliCached) {
            console.log(`⚡ BENGALI CACHE HIT — skipping translation entirely`);
            console.log(`⏱️  Total: ${elapsed(requestStart)} (cached)`);
            const encoder = new TextEncoder();
            const readableStream = new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(bengaliCached.answer));
                    controller.close();
                },
            });
            return new Response(readableStream, {
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
        }

        // ─── 1. Initialize LLM + Embeddings ──────────────────
        const sarvamLlm = new ChatOpenAI({
            modelName: 'sarvam-m',
            apiKey: process.env.SARVAM_API_KEY,
            configuration: { baseURL: 'https://api.sarvam.ai/v1' },
            temperature: 0.05,
            maxTokens: 768,
        });

        const embeddings = new OllamaEmbeddings({
            model: 'nomic-embed-text',
            baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        });

        // ─── 2. Language Detection + Conditional Translation ──
        const translateStart = performance.now();
        let englishQuestion = '';
        const inputIsEnglish = isEnglish(latestMessage);

        if (inputIsEnglish) {
            // Skip translation entirely — save ~3s
            englishQuestion = latestMessage.trim();
            console.log(`🌐 Input is English — skipping translation [0ms]`);
        } else if (conversationHistory) {
            console.log('🗣️  Translating to English via Sarvam...');
            const translationPrompt = PromptTemplate.fromTemplate(`You are a precise English translator.
Given the conversation context below, translate the latest Bengali question into clear, complete English.
Resolve any pronouns or references (like "it", "this") using the context.
Output ONLY the English translation — no explanation, no answer.

Conversation context:
{history}

Latest Bengali question: {input}
Complete English translation:`);
            englishQuestion = (await translationPrompt
                .pipe(sarvamLlm)
                .pipe(new StringOutputParser())
                .invoke({ history: conversationHistory, input: latestMessage })).trim();
        } else {
            console.log('🗣️  Translating to English via Sarvam...');
            const translationPrompt = PromptTemplate.fromTemplate(`You are a precise English translator.
Translate the following Bengali question strictly into English.
Output ONLY the English translation — no explanation, no answer.

Bengali text: {input}
English translation:`);
            englishQuestion = (await translationPrompt
                .pipe(sarvamLlm)
                .pipe(new StringOutputParser())
                .invoke({ input: latestMessage })).trim();
        }

        console.log(`🗣️  Translated: "${englishQuestion}" [${elapsed(translateStart)}]`);

        // ─── 2b. Check English cache ──────────────────────────
        const englishCacheKey = normalizeCacheKey(englishQuestion);
        const cached = getCachedResponse(englishCacheKey);
        if (cached) {
            console.log(`⚡ ENGLISH CACHE HIT — returning cached response`);
            console.log(`⏱️  Total: ${elapsed(requestStart)} (cached)`);
            // Also cache under Bengali key for next time
            setCachedResponse(bengaliCacheKey, cached.answer, cached.answerMode);
            const encoder = new TextEncoder();
            const readableStream = new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(cached.answer));
                    controller.close();
                },
            });
            return new Response(readableStream, {
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            });
        }

        // ─── 3. Embed + Search ────────────────────────────────
        // Run embedding & search together (embedding on English for best accuracy)
        const embedStart = performance.now();
        console.log('🔍 Generating query vector...');
        const queryVector = await embeddings.embedQuery(englishQuestion);
        console.log(`🔍 Embedding done [${elapsed(embedStart)}]`);

        const searchStart = performance.now();
        console.log('🗄️  Searching knowledge base...');
        const vectorStr = `[${queryVector.join(',')}]`;

        const supabase = getSupabase();
        const searchPromise = supabase.rpc('search_hms_knowledge', {
            query_embedding: vectorStr,
            similarity_threshold: 0.0,
            match_count: TOP_K,
        });

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Supabase search timed out')), SUPABASE_TIMEOUT_MS)
        );

        let answerMode = 'general';
        let confidenceTier: 'high' | 'medium' | 'low' = 'low';
        let topSimilarity = 0;
        let contextStr = '';
        let matchedAnswers: { question: string; answer: string; similarity: number }[] = [];

        try {
            const { data: matches, error: searchError } = await Promise.race([
                searchPromise,
                timeoutPromise,
            ]) as any;

            console.log(`🗄️  Search done [${elapsed(searchStart)}]`);

            if (searchError) {
                console.warn('⚠️  Search error (falling back to LLM):', searchError.message);
            } else if (matches && matches.length > 0) {
                const queryKeywords = extractKeywords(englishQuestion);
                const reranked = rerankWithKeywords(matches, queryKeywords);

                topSimilarity = reranked[0].similarity;

                if (topSimilarity >= RAG_MEDIUM) {
                    answerMode = 'rag';
                    confidenceTier = topSimilarity >= RAG_HIGH ? 'high' : 'medium';

                    matchedAnswers = reranked
                        .filter((m: any) => m.similarity >= RAG_MEDIUM)
                        .map((m: any) => ({
                            question: m.question,
                            answer: m.answer,
                            similarity: m.similarity,
                        }));

                    contextStr = matchedAnswers
                        .map((m, i) =>
                            `[Source ${i + 1} — ${(m.similarity * 100).toFixed(0)}% match]\nQ: ${m.question}\nA: ${m.answer}`
                        )
                        .join('\n\n---\n\n');

                    console.log(`✅ Found ${matchedAnswers.length} relevant sources (${confidenceTier} confidence)`);
                    if (queryKeywords.length > 0) {
                        console.log(`🔤 Keyword reranking applied: [${queryKeywords.slice(0, 5).join(', ')}]`);
                    }
                } else {
                    console.log(`📉 Best match only ${(topSimilarity * 100).toFixed(0)}% — using LLM fallback`);
                }
            }
        } catch (searchErr: any) {
            console.warn(`⚠️  KB search failed (${searchErr.message}). Using LLM-only mode.`);
        }

        console.log(`📊 Top similarity: ${topSimilarity.toFixed(4)}`);
        console.log(`🎯 Mode: ${answerMode.toUpperCase()} | Confidence: ${confidenceTier.toUpperCase()}`);

        // ─── 4. Log unknown question if similarity is weak ────
        if (topSimilarity < LOG_THRESHOLD) {
            try {
                supabase.rpc('upsert_unknown_question', {
                    p_user_question: latestMessage,
                    p_english_text: englishQuestion,
                    p_top_similarity: topSimilarity,
                }).then(({ error }) => {
                    if (error) console.warn('⚠️  Unknown question log skipped:', error.message);
                    else console.log('📝 Unknown question logged for admin review');
                });
            } catch { /* ignore */ }
        }

        // ─── 5. Build Prompt (confidence-aware + few-shot) ────
        const historySection = conversationHistory
            ? `\nPREVIOUS CONVERSATION:\n${conversationHistory}\n`
            : '';

        let prompt: PromptTemplate;
        let promptInputs: Record<string, string>;

        if (answerMode === 'rag') {
            const confidenceInstruction = confidenceTier === 'high'
                ? 'The knowledge base sources are HIGHLY relevant. Answer directly and confidently using them.'
                : 'The knowledge base sources are PARTIALLY relevant. Use them but note if the answer may be incomplete. First identify which source is most relevant, then answer.';

            prompt = PromptTemplate.fromTemplate(`You are an expert technical support agent for the SEPLe HMS/Dexter Panel.
You have access to the following verified knowledge base entries. Use them to answer the user's question accurately.
{history}
CONFIDENCE LEVEL: {confidence}

KNOWLEDGE BASE SOURCES:
{context}

STRICT RULES:
1. Answer ONLY using the knowledge base sources above. Do not use outside knowledge.
2. If multiple sources are relevant, synthesize them into one clear answer.
3. Be specific: include step numbers, values, and procedures from the sources.
4. If a source contains a step-by-step procedure, reproduce the steps EXACTLY — do not paraphrase.
5. If the sources do NOT contain a clear answer, say: "আমার কাছে এই তথ্য নেই। অনুগ্রহ করে HMS প্যানেলের ম্যানুয়াল দেখুন।"
6. CRITICAL: Write your ENTIRE answer in fluent Bengali. Do not include English.
7. Structure your answer clearly with numbered steps if the answer involves a procedure.
8. Use Markdown formatting: bold for emphasis, numbered lists for steps, tables for comparisons.
9. ANSWER LENGTH:
   - Simple factual questions → 2-3 sentences maximum
   - Procedures/troubleshooting → numbered steps, 100-200 words
   - Comparisons → use a table
   - NEVER exceed 300 words

EXAMPLE (do not repeat this, just follow the format):
Q: Modbus RTU কিভাবে কনফিগার করবো?
A: **Modbus RTU কনফিগারেশন:**
1. HMS প্যানেলে **Communication** মেন্যুতে যান
2. **Protocol** থেকে **Modbus RTU** সিলেক্ট করুন
3. **Baud Rate** সেট করুন (সাধারণত 9600 বা 19200)
4. **Parity** এবং **Stop Bits** সেট করুন

Current Question: {question}
Bengali Answer:`);

            promptInputs = {
                history: historySection,
                confidence: confidenceInstruction,
                context: contextStr,
                question: englishQuestion,
            };
        } else {
            prompt = PromptTemplate.fromTemplate(`You are an expert in industrial automation, PLCs, SCADA systems, HMS panels, communication protocols (Modbus, PROFIBUS, EtherNet/IP), and industrial troubleshooting.
{history}
RULES:
1. Answer using your expertise in industrial automation and control systems.
2. Be specific and practical. Include concrete steps where applicable.
3. If the question is completely unrelated to industrial automation or HMS panels, politely say you specialize only in HMS panel and industrial automation support — in Bengali.
4. CRITICAL: Write your ENTIRE answer in fluent Bengali. Do not include English.
5. Use Markdown formatting: bold for emphasis, lists for steps.
6. ANSWER LENGTH:
   - Simple factual questions → 2-3 sentences maximum
   - Procedures → numbered steps, 100-200 words
   - NEVER exceed 300 words

Note: This answer is from general knowledge, not the HMS-specific knowledge base.

Question: {question}
Bengali Expert Answer:`);

            promptInputs = {
                history: historySection,
                question: englishQuestion,
            };
        }

        // ─── 6. Stream Response ────────────────────────────────
        const llmStart = performance.now();
        const chain = prompt.pipe(sarvamLlm).pipe(new StringOutputParser());
        const stream = await chain.stream(promptInputs);

        // Wrap stream to capture full response for caching
        const chunks: string[] = [];
        const transformedStream = new TransformStream<string, string>({
            transform(chunk, controller) {
                chunks.push(chunk);
                controller.enqueue(chunk);
            },
            flush() {
                const fullAnswer = chunks.join('');
                // Cache under BOTH Bengali and English keys
                setCachedResponse(englishCacheKey, fullAnswer, answerMode);
                setCachedResponse(bengaliCacheKey, fullAnswer, answerMode);
                console.log(`💾 Response cached (${fullAnswer.length} chars) under 2 keys`);
            },
        });

        const pipedStream = stream.pipeThrough(transformedStream);

        // Log analytics (non-blocking)
        const totalLatency = (performance.now() - requestStart) / 1000;
        try {
            supabase.from('chat_sessions').insert({
                user_question: latestMessage,
                english_translation: englishQuestion,
                answer_mode: answerMode,
                top_similarity: topSimilarity,
                user_id: userId || null,
            }).then(({ error }) => {
                if (error) console.warn('⚠️  Analytics skipped:', error.message);
            });
        } catch { /* ignore */ }

        console.log(`⏱️  Latency: Translation=${elapsed(translateStart)} | Embed=${elapsed(embedStart)} | Search=${elapsed(searchStart)} | Pre-LLM Total=${totalLatency.toFixed(2)}s`);
        console.log(`${'═'.repeat(60)}\n`);

        return LangChainAdapter.toDataStreamResponse(pipedStream);

    } catch (error: any) {
        console.error('❌ Chat API Error:', error);
        return new Response(
            JSON.stringify({ error: 'Failed to process chat request.' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}