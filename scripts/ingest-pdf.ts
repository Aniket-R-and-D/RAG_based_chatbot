import { createClient } from '@supabase/supabase-js';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import * as fs from 'fs';
import * as path from 'path';
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { loadEnvConfig } from '@next/env';

// ─── Environment ────────────────────────────────────────────────
const projectDir = process.cwd();
loadEnvConfig(projectDir);

// ─── Custom DNS + Fetch (Windows reliability fix) ───────────────
dns.setDefaultResultOrder('ipv4first');
const googleResolver = new dns.promises.Resolver();
googleResolver.setServers(['8.8.8.8', '8.8.4.4']);

function customLookup(hostname: string, _opts: any, cb: Function) {
    googleResolver.resolve4(hostname)
        .then((addrs: string[]) => cb(null, addrs[0], 4))
        .catch((err: Error) => cb(err));
}

const agent = new Agent({ connect: { family: 4, lookup: customLookup as any } });
const customFetch = (input: any, init?: any) =>
    undiciFetch(input, { ...init, dispatcher: agent }) as unknown as Promise<Response>;

// ─── CLI Arguments ──────────────────────────────────────────────
function parseArgs() {
    const args: Record<string, string> = {};
    const flags: Set<string> = new Set();
    process.argv.slice(2).forEach((arg) => {
        const match = arg.match(/^--(\w+)=(.+)$/);
        if (match) {
            args[match[1]] = match[2];
        } else if (arg.startsWith('--')) {
            flags.add(arg.replace(/^--/, ''));
        }
    });
    return { args, flags };
}

// ═════════════════════════════════════════════════════════════════
// STAGE 1: TEXT CLEANING
// ═════════════════════════════════════════════════════════════════
function cleanText(rawText: string): string {
    let text = rawText;

    // Remove page markers like "-- 3 of 10 --" or "-- 42 of 47 --"
    text = text.replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '');

    // Remove standalone page numbers (e.g. lines that are just a number)
    text = text.replace(/^\s*\d{1,3}\s*$/gm, '');

    // Remove excessive blank lines (3+ → 2)
    text = text.replace(/\n{3,}/g, '\n\n');

    // Normalize whitespace within lines (but preserve line breaks)
    text = text.replace(/[ \t]{3,}/g, '  ');

    // Trim leading/trailing whitespace
    text = text.trim();

    return text;
}

// ═════════════════════════════════════════════════════════════════
// STAGE 2: SECTION-AWARE CHUNKING
// ═════════════════════════════════════════════════════════════════
interface SectionChunk {
    sectionTitle: string;
    content: string;
    pageHint: string;
}

/**
 * Detects section headings and prepends them to chunks so each chunk
 * carries its structural context.
 */
function detectSections(text: string): { title: string; body: string }[] {
    const lines = text.split('\n');
    const sections: { title: string; body: string }[] = [];
    let currentTitle = 'Introduction';
    let currentBody: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            currentBody.push('');
            continue;
        }

        // Heuristic: heading detection
        const isHeading =
            // ALL CAPS lines (at least 3 words or 15 chars) that are short
            (/^[A-Z][A-Z\s\-&:\/\d]{10,}$/.test(trimmed) && trimmed.length < 80) ||
            // Numbered headings like "1. Overview" or "3.2 LAN Setup"
            /^\d+(\.\d+)?\s+[A-Z]/.test(trimmed) && trimmed.length < 80 ||
            // Lines ending with colon that are short (likely sub-headings)
            (trimmed.endsWith(':') && trimmed.length < 60 && trimmed.length > 5);

        if (isHeading && currentBody.join('\n').trim().length > 0) {
            // Save previous section
            sections.push({
                title: currentTitle,
                body: currentBody.join('\n').trim(),
            });
            currentTitle = trimmed.replace(/:$/, '').trim();
            currentBody = [];
        } else {
            currentBody.push(line);
        }
    }

    // Push last section
    if (currentBody.join('\n').trim().length > 0) {
        sections.push({
            title: currentTitle,
            body: currentBody.join('\n').trim(),
        });
    }

    return sections;
}

async function createSectionAwareChunks(
    text: string,
    chunkSize: number,
    chunkOverlap: number
): Promise<SectionChunk[]> {
    const sections = detectSections(text);
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separators: ['\n\n', '\n', '. ', ' ', ''],
    });

    const allChunks: SectionChunk[] = [];

    for (const section of sections) {
        const docs = await splitter.createDocuments([section.body]);
        for (const doc of docs) {
            allChunks.push({
                sectionTitle: section.title,
                content: doc.pageContent,
                pageHint: '',
            });
        }
    }

    return allChunks;
}

// ═════════════════════════════════════════════════════════════════
// STAGE 3: LLM-POWERED Q&A GENERATION
// ═════════════════════════════════════════════════════════════════
interface QAPair {
    question: string;
    answer: string;
    keywords: string[];
}

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const QA_MODEL = 'gemma3:1b';

async function generateQA(chunk: string, sectionTitle: string, sourceName: string): Promise<QAPair> {
    const prompt = `You are a technical documentation analyst. Given the following chunk from a "${sourceName}" manual (Section: "${sectionTitle}"), generate:
1. A natural question that a user/technician would ask that this chunk answers
2. A concise, clear answer summarizing the key information
3. 3-5 relevant keywords

Chunk:
"""
${chunk.substring(0, 1500)}
"""

Respond in this EXACT JSON format only, no extra text:
{"question":"...","answer":"...","keywords":["kw1","kw2","kw3"]}`;

    try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: QA_MODEL,
                prompt,
                stream: false,
                options: {
                    temperature: 0.3,
                    num_predict: 300,
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`Ollama returned ${response.status}`);
        }

        const data = await response.json() as { response: string };
        const text = data.response.trim();

        // Try to extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                question: parsed.question || `What does the ${sectionTitle} section cover?`,
                answer: parsed.answer || chunk.substring(0, 300),
                keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
            };
        }

        throw new Error('No valid JSON in LLM response');
    } catch (err: any) {
        // Fallback: generate a basic question from section title
        return {
            question: `What information does the "${sectionTitle}" section provide in the ${sourceName}?`,
            answer: chunk.substring(0, 400),
            keywords: sectionTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2),
        };
    }
}

// ═════════════════════════════════════════════════════════════════
// STAGE 4: RICH EMBEDDING TEXT
// ═════════════════════════════════════════════════════════════════
function buildRichEmbeddingText(
    qa: QAPair,
    sectionTitle: string,
    sourceName: string,
    rawContent: string
): string {
    return [
        `Source: ${sourceName}`,
        `Section: ${sectionTitle}`,
        `Keywords: ${qa.keywords.join(', ')}`,
        `Question: ${qa.question}`,
        `Answer: ${qa.answer}`,
        `Details: ${rawContent}`,
    ].join('\n');
}

// ═════════════════════════════════════════════════════════════════
// MAIN INGESTION PIPELINE
// ═════════════════════════════════════════════════════════════════
async function ingestPdf() {
    const { args, flags } = parseArgs();
    const filePath = args.file;
    const sourceName = args.name || path.basename(filePath || '');
    const chunkSize = parseInt(args.chunkSize || '800');
    const chunkOverlap = parseInt(args.chunkOverlap || '200');
    const deepMode = !flags.has('quick'); // --deep is default, --quick skips LLM

    if (!filePath) {
        console.error('❌ Usage: npx tsx scripts/ingest-pdf.ts --file="path/to/file.pdf" --name="Manual Name" [--quick] [--chunkSize=800] [--chunkOverlap=200]');
        process.exit(1);
    }

    if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        process.exit(1);
    }

    console.log('\n' + '═'.repeat(60));
    console.log('📄 PDF Ingestion Tool — Deep Extraction Pipeline');
    console.log('═'.repeat(60));
    console.log(`📁 File: ${filePath}`);
    console.log(`📝 Source Name: ${sourceName}`);
    console.log(`✂️  Chunk size: ${chunkSize}, overlap: ${chunkOverlap}`);
    console.log(`🧠 Mode: ${deepMode ? 'DEEP (LLM Q&A generation)' : 'QUICK (section-aware only)'}`);

    // ─── 1. Read PDF ────────────────────────────────────────────
    console.log('\n📖 Reading PDF...');
    const pdfBuffer = fs.readFileSync(filePath);
    const { PDFParse } = await import('pdf-parse') as any;
    const pdfUint8 = new Uint8Array(pdfBuffer);
    const parser = new PDFParse(pdfUint8);
    const pdfData = await parser.getText();
    console.log(`   ${pdfData.total} pages, ${pdfData.text.length} characters`);

    // ─── 2. Clean Text ──────────────────────────────────────────
    console.log('\n🧹 Stage 1: Cleaning text...');
    const cleanedText = cleanText(pdfData.text);
    const removedChars = pdfData.text.length - cleanedText.length;
    console.log(`   Removed ${removedChars} characters of noise (${((removedChars / pdfData.text.length) * 100).toFixed(1)}%)`);

    // ─── 3. Section-Aware Chunking ──────────────────────────────
    console.log('\n📑 Stage 2: Section-aware chunking...');
    const chunks = await createSectionAwareChunks(cleanedText, chunkSize, chunkOverlap);
    const sectionNames = [...new Set(chunks.map(c => c.sectionTitle))];
    console.log(`   ${chunks.length} chunks across ${sectionNames.length} sections`);
    sectionNames.forEach(s => console.log(`     📂 ${s}`));

    // ─── 4. Setup Supabase & OpenAI ────────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        global: { fetch: customFetch },
    });
    const embeddings = new OllamaEmbeddings({
        model: 'nomic-embed-text',
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    });

    // ─── 5. Process & Upsert ────────────────────────────────────
    let success = 0;
    let errors = 0;

    console.log(`\n🚀 Stage ${deepMode ? '3+4' : '3'}: ${deepMode ? 'LLM Q&A + ' : ''}Embedding & Upserting...`);

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const id = `pdf_${sourceName.replace(/\s+/g, '_').toLowerCase()}_${String(i).padStart(4, '0')}`;
        const progress = `[${i + 1}/${chunks.length}]`;

        try {
            let qa: QAPair;

            if (deepMode) {
                // Stage 3: LLM Q&A generation
                process.stdout.write(`   🧠 ${progress} Generating Q&A for "${chunk.sectionTitle}"...`);
                qa = await generateQA(chunk.content, chunk.sectionTitle, sourceName);
                process.stdout.write(` ✓\n`);
            } else {
                // Quick mode: use section title as question
                qa = {
                    question: `[${chunk.sectionTitle}] ${sourceName} - Part ${i + 1}`,
                    answer: chunk.content.substring(0, 400),
                    keywords: chunk.sectionTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2),
                };
            }

            // Stage 4: Rich embedding text
            const embeddingText = buildRichEmbeddingText(qa, chunk.sectionTitle, sourceName, chunk.content);

            // Generate vector
            const vector = await embeddings.embedQuery(embeddingText);

            // Upsert to Supabase
            const { error } = await supabase.from('hms_knowledge').upsert({
                id,
                question: qa.question,
                answer: qa.answer,
                category: chunk.sectionTitle,
                content: embeddingText,
                embedding: vector,
                source: 'pdf',
                source_name: sourceName,
            });

            if (error) {
                console.error(`   ❌ ${progress} ${id}: ${error.message}`);
                errors++;
            } else {
                console.log(`   ✅ ${progress} Q: "${qa.question.substring(0, 70)}..."`);
                success++;
            }
        } catch (err: any) {
            console.error(`   ❌ ${progress} ${id}: ${err.message}`);
            errors++;
        }
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`✅ PDF ingestion complete!`);
    console.log(`   Mode: ${deepMode ? 'DEEP' : 'QUICK'}`);
    console.log(`   Success: ${success}/${chunks.length} chunks`);
    if (errors > 0) console.log(`   Errors: ${errors}`);
    console.log(`   Sections detected: ${sectionNames.length}`);
    console.log(`   Source: ${sourceName}`);
    console.log('═'.repeat(60) + '\n');
}

ingestPdf().catch(console.error);
