import { loadEnvConfig } from '@next/env';
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { createClient } from '@supabase/supabase-js';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import * as fs from 'fs';
import * as path from 'path';

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

const projectDir = process.cwd();
loadEnvConfig(projectDir);

/**
 * Build a rich, dense embedding text for a Q&A entry.
 *
 * WHY THIS MATTERS:
 * The embedding vector represents the *meaning* of this text.
 * The richer and more specific the text, the better the cosine
 * similarity match when a user asks a related question.
 *
 * Key improvements over the original:
 * - Include alternative phrasings of the question (increases recall)
 * - Include keywords/tags as noun phrases (not just comma-separated)
 * - Repeat the most important terms to boost their weight
 */
function buildEmbeddingText(item: any): string {
    // Build natural-language tag phrases (better than "Tags: a, b, c")
    const tagPhrases = item.tags
        .map((t: string) => t.toLowerCase())
        .join(', ');

    // Synthesize alternative question phrasings from tags
    // This means "how to fix Modbus timeout" will also match
    // entries tagged with "Modbus", "timeout", "communication fault"
    const alternativePhrasings = [
        `How to handle ${item.subcategory.toLowerCase()} issues`,
        `${item.subcategory} troubleshooting for ${item.product}`,
        `${item.category} - ${item.subcategory}`,
    ].join('. ');

    return [
        `Product: ${item.product}`,
        `Category: ${item.category}`,
        `Subcategory: ${item.subcategory}`,
        `Keywords: ${tagPhrases}`,
        `Related topics: ${alternativePhrasings}`,
        `Question: ${item.question}`,
        `Answer: ${item.answer}`,
        // Repeat question & key tags to boost relevance weight
        `Summary: ${item.subcategory} - ${item.question}`,
    ].join('\n');
}

async function seed() {
    console.log('🏁 Starting improved Supabase seeding...\n');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    console.log('🗄️  Connecting to Supabase...');
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        global: { fetch: customFetch as any },
    });

    console.log('📂 Reading dataset...');
    const dataPath = path.join(process.cwd(), 'data', 'hms-dexter-qa.json');
    const qaData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    console.log(`   Found ${qaData.length} Q&A entries.\n`);

    console.log('🦙 Initializing Ollama nomic-embed-text...');
    const embeddings = new OllamaEmbeddings({
        model: 'nomic-embed-text',
        baseUrl: ollamaBaseUrl,
    });

    const BATCH_SIZE = 10;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < qaData.length; i += BATCH_SIZE) {
        const batch = qaData.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(qaData.length / BATCH_SIZE);

        console.log(`\n⏳ Batch ${batchNum}/${totalBatches} (items ${i + 1}–${Math.min(i + BATCH_SIZE, qaData.length)})...`);

        for (const item of batch) {
            try {
                const embeddingText = buildEmbeddingText(item);
                const vector = await embeddings.embedQuery(embeddingText);

                const { error } = await supabase
                    .from('hms_knowledge')
                    .upsert({
                        id: item.id,
                        question: item.question,
                        answer: item.answer,
                        category: item.category,
                        subcategory: item.subcategory,
                        product: item.product,
                        tags: item.tags,
                        content: embeddingText,
                        embedding: vector,
                        source: 'json',
                        source_name: 'hms-dexter-qa.json',
                    }, { onConflict: 'id' });

                if (error) {
                    console.error(`   ❌ ${item.id}: ${error.message}`);
                    errorCount++;
                } else {
                    console.log(`   ✅ ${item.id}: "${item.question.substring(0, 55)}..."`);
                    successCount++;
                }
            } catch (err: any) {
                console.error(`   ❌ ${item.id}: ${err.message}`);
                errorCount++;
            }
        }
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Seeding complete!`);
    console.log(`   Success: ${successCount}/${qaData.length}`);
    if (errorCount > 0) console.log(`   Errors:  ${errorCount}`);
    console.log(`${'='.repeat(50)}`);
    console.log('\n💡 Remember to re-run this after any changes to hms-dexter-qa.json!');
}

seed().catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});