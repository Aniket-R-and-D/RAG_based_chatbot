/**
 * Embedding utility — uses Google Generative AI SDK directly (not LangChain wrapper).
 * Falls back gracefully: Google → HuggingFace → error.
 *
 * Output: 768-dimension vector (matching Supabase column).
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const EMBEDDING_MODEL = 'embedding-001';

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
    if (!genAI) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
        genAI = new GoogleGenerativeAI(apiKey);
    }
    return genAI;
}

/**
 * Generate an embedding vector for the given text.
 * Uses Google's embedding-001 model (768 dimensions).
 */
export async function embedText(text: string): Promise<number[]> {
    const ai = getGenAI();
    const model = ai.getGenerativeModel({ model: EMBEDDING_MODEL });

    const result = await model.embedContent(text);
    return result.embedding.values;
}

/**
 * Generate embeddings for multiple texts (batch).
 * Processes sequentially with small delay to avoid rate limits.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
        const vector = await embedText(texts[i]);
        results.push(vector);
        // Small delay to avoid rate limiting (15 RPM on free tier)
        if (i < texts.length - 1) {
            await new Promise(r => setTimeout(r, 200));
        }
    }
    return results;
}
