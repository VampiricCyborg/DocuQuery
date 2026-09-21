<div align="center">

<img src="docs/screenshots/hero-dark.png" alt="DocuQuery — ask your documents a question and get a cited answer" width="820">

<br/>

# DocuQuery

### Turn a folder of PDFs, DOCX, and text files into a source you can ask questions.

Upload your documents. DocuQuery reads them, indexes them, and answers questions with the
exact page and passage the answer came from — no more skimming a 40-page report for one number.

### [▶ Try it live at docuqueryvc.vercel.app](https://docuqueryvc.vercel.app)

<sub>Frontend on Vercel · API at [`docuqueryprod.up.railway.app`](https://docuqueryprod.up.railway.app/health) on Railway · sign up with any email to upload your own documents</sub>

[**See it work**](#-see-it-work) · [**Quick start**](#-quick-start) · [**Features**](#-features) · [**API reference**](#-api-reference) · [**Roadmap**](#-roadmap)

[![CI](https://github.com/VampiricCyborg/DocuQuery/actions/workflows/ci.yml/badge.svg)](https://github.com/VampiricCyborg/DocuQuery/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/version-0.1.0-blue?style=flat-square)
![Next.js](https://img.shields.io/badge/Next.js-16.2-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-19.2-61dafb?style=flat-square&logo=react)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20%2B%20pgvector-336791?style=flat-square&logo=postgresql)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)

</div>

---

## What DocuQuery actually does

Most "chat with your docs" demos are a thin wrapper around one LLM call. DocuQuery is the
plumbing that makes that call trustworthy: it parses your files properly, chunks and embeds
them, stores the vectors in Postgres, retrieves the passages that actually answer the question,
and hands the model only that — then shows you exactly where the answer came from.

- 📂 **Drop in a file** — PDF, DOCX, TXT, or Markdown, up to 50MB
- ⚡ **It gets indexed automatically** — parsed, cleaned, chunked, embedded, and stored in seconds
- 💬 **Ask in plain language** — no query syntax, no filters to configure
- 📎 **Get an answer with receipts** — every claim links back to the filename, page, and passage
- 🔀 **Pick how strict you want it** — answer strictly from your documents, from general knowledge, or both

---

## 👀 See it work

<div align="center">
<img src="docs/screenshots/demo.gif" alt="A question is typed, DocuQuery searches the uploaded documents, streams back an answer, then shows the cited source" width="760">
<br/>
<sub>One question, start to finish — typed, searched, answered, cited. No cuts.</sub>

<br/>

<sub>Rather do it yourself? <a href="https://docuqueryvc.vercel.app">Open the live app</a> and upload a document.</sub>
</div>

<br/>

<div align="center">
<img src="docs/screenshots/hero-light.png" alt="DocuQuery landing page in light mode" width="760">
</div>

---

## 🧭 How it works

<div align="center">
<img src="docs/screenshots/how-it-works.png" alt="Four steps: upload, index, ask, answer" width="900">
</div>

| Step | What happens |
|---|---|
| **1. Upload** | Drag in a PDF, DOCX, TXT, or MD file. It's validated, saved, and marked `uploaded`. |
| **2. Index** | In the background: parsed → cleaned → split into passages → embedded into 384-dim vectors → stored in pgvector with an HNSW index. Status flips to `indexed`. |
| **3. Ask** | Type a question in plain language. Pick a mode: answer from your documents only, from the model's general knowledge, or both. |
| **4. Answer** | The response streams back token by token, then a citation appears — the exact document, page, and passage the claim came from. |

---

## ✨ Features

<div align="center">
<img src="docs/screenshots/features.png" alt="Every answer shows its receipts, three chat modes, and a document library you can scan" width="900">
</div>

| Feature | What it means for you |
|---|---|
| 📎 **Answers with receipts** | Every claim is linked to a filename, page, and passage — click through and verify it yourself |
| 🔀 **Three chat modes** | `DocuQuery` (documents only), `LLM` (general knowledge), `Hybrid` (documents + reasoning + optional live web search) — switch mid-conversation |
| 🔴 **Real-time streaming** | Token-by-token responses over SSE, with lossless Markdown — lists, tables, and code blocks render exactly as the model wrote them |
| 📁 **A library you can scan** | A dense table of every upload with live indexing status and file size |
| 🧮 **Real vector search** | PostgreSQL + pgvector with HNSW indexing — cosine similarity, not keyword matching |
| 🔌 **Bring your own LLM** | Groq, OpenAI, Anthropic, Gemini, or a local Ollama model — swap providers via one config value |
| 🔐 **Real authentication** | Signed HTTP-only session cookies, PBKDF2-SHA256 password hashing, protected routes |
| 🛡️ **Production hardening** | Per-IP rate limiting on upload and chat, security headers on every response |
| 🎙️ **Voice input** | Ask out loud via the Web Speech API |
| ⌨️ **Built for keyboard users** | `Ctrl+K` for a new chat, full keyboard navigation through menus and the mode selector |
| 🌙 **Dark-first design** | A deliberate, token-based design system — not default framework styling |

---

## 🛠️ Tech stack

<table>
<tr>
<td valign="top" width="50%">

**Frontend**

| | |
|---|---|
| Framework | [Next.js 16.2](https://nextjs.org/) (App Router) |
| Language | [TypeScript 5](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com/) |
| UI primitives | [Radix UI](https://www.radix-ui.com/) |
| Animation | [Framer Motion](https://www.framer.com/motion/) |
| State | [Zustand 5](https://zustand-demo.pmnd.rs/) + [TanStack Query v5](https://tanstack.com/query) |
| Markdown | [react-markdown](https://remarkjs.github.io/react-markdown/) + remark-gfm |

</td>
<td valign="top" width="50%">

**Backend**

| | |
|---|---|
| Framework | [FastAPI 0.115](https://fastapi.tiangolo.com/) on [Python 3.13](https://python.org/) |
| Database | [PostgreSQL 16](https://postgresql.org/) + [pgvector](https://github.com/pgvector/pgvector) |
| ORM / migrations | [SQLAlchemy 2](https://sqlalchemy.org/) (async) + [Alembic](https://alembic.sqlalchemy.org/) |
| Parsing | [PyMuPDF](https://pymupdf.readthedocs.io/) (PDF) · [python-docx](https://python-docx.readthedocs.io/) |
| Embeddings | [ONNX Runtime](https://onnxruntime.ai/) — `BAAI/bge-small-en-v1.5` (INT8) |
| LLM providers | Groq · OpenAI · Anthropic · Gemini · Ollama |
| Rate limiting | [slowapi](https://github.com/laurentS/slowapi) |
| Deployment | [Railway](https://railway.app/) (API) · [Vercel](https://vercel.com/) (web) |

</td>
</tr>
</table>

---

## 🚀 Quick start

### Prerequisites

Node.js 20+ · Python 3.13+ · Docker Desktop · a free [Groq API key](https://console.groq.com/)

### 1 — Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 2 — Backend (Docker, recommended)

```bash
cd backend
cp .env.example .env
# set LLM_API_KEY and DATABASE_URL in .env
docker compose up --build
docker compose exec api python -m alembic upgrade head
```

API runs at [http://localhost:8000](http://localhost:8000) · interactive docs at `/docs` when `DEBUG=true`.

<details>
<summary><b>Prefer running the backend without Docker?</b></summary>

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
cp .env.example .env
python -m alembic upgrade head
uvicorn app.main:app --reload
```

</details>

<details>
<summary><b>Environment variables you'll actually need to touch</b></summary>

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/docuquery

LLM_PROVIDER=groq
LLM_MODEL=qwen/qwen3.8-27b
LLM_API_KEY=<your-groq-api-key>

# Optional — enables live web search in Hybrid mode
TAVILY_API_KEY=<your-tavily-api-key>
```

The full list — chunking, retrieval thresholds, rate limits, auth cookie settings — lives in
[`backend/.env.example`](backend/.env.example) with inline comments.

</details>

---

## 💬 Chat modes

Every request to `POST /chat` carries a `mode`:

| Mode | Retrieval | Sources shown |
|---|---|---|
| `docuquery` | Searches your indexed documents only | Document, page, and passage citations |
| `llm` | Skips document retrieval entirely | None |
| `hybrid` | Documents, plus live web search via Tavily when configured | Document citations + linked web sources |

```json
// POST /chat
{ "message": "What are the key findings in the Q3 report?", "mode": "docuquery" }
```

```json
// Response
{
  "answer": "Revenue grew 23% YoY to $4.2M...",
  "citations": [{ "filename": "Q3_Report_2024.pdf", "page": 7, "chunk_index": 12 }],
  "model": "qwen/qwen3.8-27b"
}
```

---

## 🔌 API reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Liveness + DB connectivity check |
| `POST` | `/upload` | Upload a document — triggers the ingestion pipeline |
| `GET` | `/documents` | List all documents with processing status |
| `GET` | `/documents/{id}` | Get a single document |
| `GET` | `/documents/{id}/chunks` | Inspect a document's indexed chunks |
| `GET` | `/documents/{id}/debug` | Indexing diagnostics — recorded vs. actual chunk count, and how many carry an embedding |
| `DELETE` | `/documents/{id}` | Delete a document and all its chunks |
| `POST` | `/retrieve` | Vector similarity search — chunks + context, no LLM call |
| `POST` | `/chat` | Full RAG pipeline — streams an answer with citations |
| `POST` | `/auth/signup` | Create an account, establish a session |
| `POST` | `/auth/login` | Authenticate, establish a session |
| `GET` | `/auth/me` | Return the authenticated user |
| `POST` | `/auth/logout` | Clear the session cookie |

Full interactive docs at `/docs` when the backend runs with `DEBUG=true`.

<details>
<summary><b>How a document becomes searchable</b></summary>

```
POST /upload
     │
     ▼
Validate file (type + size) ──► saved to disk, status: UPLOADED
     │
     ▼  [background task]
Parse  (PyMuPDF · python-docx · plain text, heading-aware for Markdown)
     │
     ▼  status: PROCESSING
Clean text  →  Chunk  (recursive splitter, 800 tokens / 120 overlap)
     │
     ▼
Embed  (BAAI/bge-small-en-v1.5, ONNX INT8, 384 dims, batched)
     │
     ▼
Store  (PostgreSQL + pgvector, HNSW index, cosine similarity)
     │
     ▼
status: INDEXED
```

</details>

<details>
<summary><b>How a question becomes a cited answer</b></summary>

```
POST /chat  { "message": "..." }
     │
     ▼
Embed the query  →  Vector search (top-k chunks)  →  Score, dedupe, rank
     │
     ▼
Build context (token-budgeted)  →  Construct prompt (versioned system prompt)
     │
     ▼
LLM generation (Groq / OpenAI / Anthropic / Gemini / Ollama)
     │
     ▼
Stream response over SSE: tokens → citations → [DONE]
```

The streaming client strips only the SSE framing space after `data:` — whitespace, paragraph
breaks, lists, tables, and code blocks from the model arrive intact.

</details>

---

## 🗺️ Roadmap

- [x] Document ingestion, vector retrieval, and multi-provider LLM streaming
- [x] Signed session authentication and protected routes
- [x] Rate limiting and security headers
- [ ] Hybrid retrieval with BM25 + reciprocal rank fusion
- [ ] Cross-encoder reranking
- [ ] Role-based access control
- [ ] Agentic RAG (multi-agent orchestration)
- [ ] Multimodal RAG (OCR, images, tables)

---

## 🧪 Running tests

```bash
cd backend && pytest -q
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

The backend suite covers parsing, chunking, retrieval scoring, citations, prompt construction,
provider abstraction, streaming, password hashing, and session validation. It needs no database
and no API keys — the database and the embedding service are mocked.

Every push to `main` and every pull request runs the same commands on GitHub Actions
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) — that is what the CI badge at the top
reports.

---

## 🤝 Contributing

1. Fork the repo and create a branch: `git checkout -b feature/your-feature`
2. Commit using [Conventional Commits](https://www.conventionalcommits.org/): `feat: add retrieval endpoint`
3. Run `npm run build` (frontend) and `pytest` (backend) — zero failures before opening a PR
4. Open a PR against `main`

---

## 📄 License

Distributed under the [MIT License](./LICENSE).

---

<div align="center">
<sub>Built with Next.js, FastAPI, pgvector, and Groq.</sub>
</div>
