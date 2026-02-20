# Dexter Tech Support AI

Dexter Tech Support AI is a locally-hosted, secure Retrieval-Augmented Generation (RAG) chatbot designed to provide technical support for the SEPLe HMS/Dexter Panel. It answers user questions strictly based on the provided technical documentation, ensuring accurate, hallucination-free assistance for setup, troubleshooting, and network issues.

## 🚀 Key Features

- **100% Local Processing:** Uses local LLMs and embeddings via Ollama to ensure complete data privacy and avoid cloud API costs.
- **RAG Architecture:** Leverages LangChain and Pinecone vector database to retrieve the most relevant technical documentation for every query.
- **Strict Context Adherence:** The AI is strictly prompted to only answer based on the retrieved context, eliminating model hallucinations.
- **Dynamic Suggestions:** Surfaces context-aware suggested questions for quick access to common troubleshooting steps.
- **Rich Metadata:** Vector embeddings are enriched with expansive categorization tags (ID, Category, Subcategory, Product) for high-precision retrieval.

## 🛠️ Technology Stack

- **Frontend:** Next.js, React, Tailwind CSS
- **AI Integration:** Vercel AI SDK (`ai/react`), LangChain
- **Vector Database:** Pinecone
- **Local Inference:** Ollama (Models: `llama3`, `nomic-embed-text`)
- **Data Ingestion:** Custom TypeScript ingestion scripts

## ⚙️ Setup & Installation

Follow these steps to run the agent locally:

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment Variables:**
   Rename `.env.local.example` (or create a `.env.local` file) and add your Pinecone credentials:
   ```env
   PINECONE_API_KEY=your_pinecone_api_key
   PINECONE_INDEX_NAME=motorcycle-rag
   OLLAMA_BASE_URL=http://localhost:11434
   ```

3. **Start Local Ollama Services:**
   Make sure you have Ollama installed and running with the correct models:
   ```bash
   ollama pull llama3
   ollama pull nomic-embed-text
   ```

4. **Seed the Knowledge Base:**
   Ingest the technical documentation into your Pinecone vector index:
   ```bash
   # Optional: Clear existing vectors
   npx tsx scripts/clear.ts
   
   # Upload new vectors
   npx tsx scripts/seed.ts
   ```

5. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) with your browser to chat with the AI!
