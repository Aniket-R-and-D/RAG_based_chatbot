# Dexter Tech Support AI

**Dexter Tech Support AI** is a specialized, Retrieval-Augmented Generation (RAG) chatbot designed to provide technical support for the **SEPLe HMS/Dexter Panel**. It answers user queries strictly based on provided technical documentation, ensuring accurate, hallucination-free assistance for installation, troubleshooting, and network configurations in industrial environments.

---

## 🚀 Overview

The system is built to handle multi-language support (specifically Bengali and English). It processes Bengali queries by translating them to English for high-precision semantic search against a technical knowledge base, and then generates structured, fluent Bengali responses.

### Key Features
- **Multi-Source RAG:** Ingests data from structured JSON Q&A pairs and unstructured PDF manuals.
- **Intelligent Translation:** Uses Gemini-2.0-Flash to translate and resolve context in Bengali queries.
- **Confidence-Aware Answers:** Adapts response tone based on vector search similarity scores (High, Medium, and Low confidence tiers).
- **Industrial Support Expert:** Specifically tuned for Modbus, PROFIBUS, EtherNet/IP, and PLC/SCADA troubleshooting.
- **Admin Dashboard:** Tracks user queries, logs "unknown" questions for manual review, and provides analytics.
- **Skeuomorphic UI:** A modern, industrial-themed interface built with Tailwind CSS.

---

## 🛠️ Technology Stack

- **Frontend:** [Next.js 16](https://nextjs.org/), React 19, Tailwind CSS 4.
- **AI/LLM:** [Google Gemini 2.0 Flash](https://deepmind.google/technologies/gemini/) (Translation & Generation).
- **Embeddings:** Google `embedding-001` (768-dimension vectors).
- **Database:** [Supabase](https://supabase.com/) with `pgvector` for semantic search.
- **Orchestration:** [Vercel AI SDK](https://sdk.vercel.ai/), LangChain.
- **Data Ingestion:** PDF-parse, RecursiveCharacterTextSplitter (LangChain), Ollama (optional for local extraction).

---

## 📂 Project Structure

```text
tech-support-ai/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── admin/              # Admin dashboard UI
│   │   ├── api/                # API Routes (Chat, Users, Admin, Analytics)
│   │   ├── globals.css         # Global styles & Tailwind config
│   │   ├── layout.tsx          # Root layout with FontAwesome & Fonts
│   │   └── page.tsx            # Main Chat interface (Client Component)
│   ├── lib/                    # Core utilities
│   │   ├── embeddings.ts       # Google Embedding-001 integration
│   │   └── supabase.ts         # Supabase client with custom DNS fixes
├── supabase/
│   └── migrations/             # SQL migrations for pgvector & schema
├── scripts/                    # Maintenance & Ingestion scripts
│   ├── seed-supabase.ts        # Seed Supabase from JSON Q&A
│   ├── ingest-pdf.ts           # Deep PDF extraction & ingestion
│   ├── audit-kb.ts             # Knowledge base quality audit
│   └── clear.ts                # Database cleanup tool
├── data/                       # Source documentation
│   ├── hms-dexter-qa.json      # Structured Q&A dataset
│   └── pdf/                    # Technical manuals and guides
├── public/                     # Static assets (icons, images)
├── tsconfig.json               # TypeScript configuration
└── package.json                # Project dependencies & scripts
```

---

## ⚙️ Installation

### 1. Prerequisites
- [Node.js 20+](https://nodejs.org/)
- [Supabase Account](https://supabase.com/) (or local Docker instance)
- [Google AI Studio API Key](https://aistudio.google.com/) (for Gemini)

### 2. Clone and Install
```bash
git clone https://github.com/your-repo/tech-support-ai.git
cd tech-support-ai
npm install
```

### 3. Database Setup
1. Create a new Supabase project.
2. Run the SQL migrations in the Supabase SQL Editor in this order:
   - `001_setup_pgvector.sql`
   - `002_full_schema.sql`
   - `003_three_layer_modes.sql`

### 4. Configuration
Create a `.env.local` file in the root directory:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google AI
GEMINI_API_KEY=your_google_gemini_api_key

# Optional: Local Ollama (used for PDF ingestion Q&A generation)
OLLAMA_BASE_URL=http://localhost:11434
```

---

## 📖 Usage

### Data Ingestion
To populate the knowledge base from the included JSON data:
```bash
npx tsx scripts/seed-supabase.ts
```

To ingest a new PDF manual:
```bash
npx tsx scripts/ingest-pdf.ts --file="data/pdf/manual.pdf" --name="Manual Name"
```

### Development
Start the development server:
```bash
npm run dev
```
Access the application at `http://localhost:3000`.

---

## 🧠 Working Principle

1.  **Input Normalization:** The user sends a query (Bengali or English).
2.  **Contextual Translation:** If the input is Bengali, Gemini translates it to English, resolving pronouns based on the last 4 turns of chat history.
3.  **Vector Search:** The English query is converted into a 768-dimensional vector using Google's `embedding-001`.
4.  **Supabase Retrieval:** A `pgvector` similarity search (cosine distance) is performed in the `hms_knowledge` table to find the top 5 matches.
5.  **Reranking:** Matches are boosted if they contain specific keywords from the user's query.
6.  **Prompt Engineering:**
    - **High Confidence:** LLM is told to answer directly from sources.
    - **Medium Confidence:** LLM is told to provide a caveat about partial relevance.
    - **Low Confidence:** LLM falls back to general industrial automation knowledge but logs the question for admin review.
7.  **Response Generation:** Gemini-2.0-Flash generates a structured Bengali response using Markdown (tables, steps, bolding).
8.  **Streaming:** The response is streamed to the UI using the Vercel AI SDK for a real-time feel.

---

## 🧪 Testing

The project uses ESLint for code quality and TypeScript for type safety.

- **Linting:** `npm run lint`
- **Type Check:** `npx tsc --noEmit`
- **Manual Data Audit:** `npx tsx scripts/audit-kb.ts` (checks for embedding quality and gaps).

---

## 🤝 Contribution

1.  **Fork** the repository.
2.  Create a **Feature Branch** (`git checkout -b feature/AmazingFeature`).
3.  **Commit** your changes (`git commit -m 'Add some AmazingFeature'`).
4.  **Push** to the branch (`git push origin feature/AmazingFeature`).
5.  Open a **Pull Request**.

---

## 📝 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

## 👤 Author & Support

- **Author:** itine
- **Version:** 0.1.0
- **Status:** Active Development

For technical support or inquiries, please contact:
- **Email:** support@example.com (Placeholder)
- **Dashboard:** Access the `/admin` route for system health and query logs.

---
*Powered by Google Gemini & Supabase.*
