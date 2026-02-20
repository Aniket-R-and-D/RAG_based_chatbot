import { Pinecone } from '@pinecone-database/pinecone';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { LangChainAdapter } from 'ai';

// Initialize Pinecone
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
});

// Using App Router Edge Runtime or Node runtime. 
// We'll use Node runtime since Langchain's ChatOllama relies on it seamlessly.
export const maxDuration = 45;

export async function POST(req: Request) {
    try {
        const { messages } = await req.json();
        const latestMessage = messages[messages.length - 1].content;

        console.log(`💬 User asks: "${latestMessage}"`);

        // 1. Generate embedding for user's query locally
        const embeddings = new OllamaEmbeddings({
            model: 'nomic-embed-text',
            baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        });

        console.log('🔍 Generating query vector...');
        const queryVector = await embeddings.embedQuery(latestMessage);

        // 2. Search Pinecone for context
        console.log('🌲 Searching Pinecone database...');
        const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);
        const queryResponse = await index.query({
            vector: queryVector,
            topK: 3, // Find top 3 most relevant chunks
            includeMetadata: true,
        });

        // 3. Extract relevant context
        const contextStr = queryResponse.matches
            .map((match) => match.metadata?.text)
            .join('\n\n');

        console.log(`📚 Found Context: \n${contextStr}\n`);

        // 4. Set up the local Ollama LLM
        const llm = new ChatOllama({
            model: "llama3",
            baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        });

        // 5. Build strictly scoped prompt
        const prompt = PromptTemplate.fromTemplate(`You are a top-tier technical support assistant for the SEPLe HMS/Dexter Panel. Your job is strictly to answer troubleshooting and setup questions based ONLY on the provided context below.

CONTEXT FACTS:
{context}

STRICT RULES:
- Answer the specific question asked: {question}
- Only use the context provided. Do not use outside knowledge.
- If the context does NOT contain the answer to the user's question, you MUST say exactly: "I don't have that information in my knowledge base."
- Do NOT hallucinate. Be helpful, concise, and professional.

Support Answer:
`);

        // 6. Chain and stream the result back to the frontend
        const stream = await prompt.pipe(llm).pipe(new StringOutputParser()).stream({
            context: contextStr,
            question: latestMessage,
        });

        return LangChainAdapter.toDataStreamResponse(stream);
    } catch (error) {
        console.error('❌ Chat API Error:', error);
        return new Response(JSON.stringify({ error: 'Failed to process chat request. Check server console.' }), { status: 500 });
    }
}
