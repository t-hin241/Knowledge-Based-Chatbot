# 🧠 Talk2Doc — Knowledge-Based Chatbot

> An AI-powered document intelligence platform. Upload your documents, ask questions, and get grounded, cited answers — powered by RAG (Retrieval-Augmented Generation).

![Talk2Doc Banner](https://cdn-1.webcatalog.io/catalog/browsercat/browsercat-icon-filled-256.png?v=1741746785186)

---

## 📖 Introduction

**Talk2Doc** is a full-stack AI chatbot application that lets users have intelligent conversations with their own documents. Instead of generic AI responses, every answer is grounded in the actual content of uploaded files — eliminating hallucinations and keeping responses factual and traceable.

The platform supports multi-document conversations, optional live web search augmentation, session history, user authentication, and subscription-based usage tiers. It is packaged as a production-ready Docker Compose application with persistent storage for uploads, vector embeddings, and user data.

---

## ✨ Application Features

### 📄 Document Intelligence
- **Upload & process** PDF, DOCX, TXT, and other text documents
- **Vector embedding** with ChromaDB for semantic similarity search
- **Multi-document context** — select up to N documents per conversation (Free tier: 2)
- **Cited responses** — every answer shows which document(s) the information came from, labeled as "Doc 1", "Doc 2", etc. with filenames
- **Live document status** — real-time processing indicators (pending → processing → ready)

### 💬 Conversational AI
- **Streaming responses** via Server-Sent Events (SSE) for a real-time typing effect
- **RAG pipeline** — hybrid retrieval combining dense vector search with reranking
- **Web search toggle** — optionally augment responses with live internet results
- **Session history** — conversations persist across sessions and are resumable
- **Message editing** — edit a past message to regenerate the response from that point
- **Conversation management** — create, browse, and delete chat sessions

### 👤 User Accounts & Subscriptions
- **JWT authentication** — secure login and registration with token refresh
- **Subscription tiers** — Free (15 requests/day, 2 documents/session) and Pro (unlimited)
- **Upgrade prompts** — contextual modals when plan limits are reached
- **Profile page** — view account details and manage subscription / billing

### 🎨 UI & UX
- **Premium dark mode** — rich zinc palette with amber accents, glassmorphism, smooth animations
- **Light / Dark theme toggle** — whole-page theme switching persisted to `localStorage`, applying instantly on load (no flash)
- **Sidebar user dropdown** — settings panel with theme toggle, notification toggle, and report link; direct profile link
- **Sound notifications** — optional Web Audio API chime when AI finishes responding
- **Responsive layout** — sidebar + main chat panel with flexible document selection
- **Reactive design** — micro-animations on hover and click across all interactive elements

---

## 🔮 Further Updates

The following features are planned for future iterations:

| Area | Planned Feature |
|------|----------------|
| 🔍 Search | Full-text search across all session history |
| 📎 Documents | Support spreadsheets (XLSX) and scanned PDFs via OCR |
| 🤝 Collaboration | Shared workspaces for teams |
| 🌐 i18n | Multi-language UI support |
| 📊 Analytics | Usage dashboard — tokens consumed, documents processed |
| 🔔 Notifications | Email / push notifications for background document processing |
| 🔐 OAuth | Google / GitHub social login |
| 📱 Mobile | Progressive Web App (PWA) support |
| 🧩 Integrations | Google Drive, Dropbox, Notion document import |
| 💳 Billing | Stripe integration for Pro tier subscription payments |

---

## 🛠️ Tech Stack

### Backend
| Technology | Role |
|-----------|------|
| **FastAPI** | Async REST API framework |
| **SQLAlchemy (async)** | ORM with async PostgreSQL sessions |
| **Alembic** | Database schema migrations |
| **PostgreSQL 16** | Primary relational database |
| **Redis 7** | Rate limiting, caching, session management |
| **ChromaDB** | Vector database for document embeddings |
| **LangChain** | RAG pipeline orchestration |
| **Groq (LLaMA 3)** | LLM inference — ultra-fast chat completions |
| **HuggingFace** | Sentence-transformers for embedding generation |
| **PyMuPDF / python-docx** | Document parsing and text extraction |
| **JWT (python-jose)** | Authentication token signing and verification |

### Frontend
| Technology | Role |
|-----------|------|
| **React 18** | UI component framework |
| **TypeScript** | Type-safe component and API layer |
| **Vite** | Fast build tooling and dev server |
| **TailwindCSS** | Utility-first styling |
| **Zustand** | Lightweight global state management |
| **React Router v6** | Client-side routing |
| **Syne + Inter** | Premium display and body typography (Google Fonts) |
| **DM Mono** | Monospaced font for code blocks |

### Infrastructure
| Technology | Role |
|-----------|------|
| **Docker + Docker Compose** | Full-stack containerization |
| **Nginx** | Static file serving + API reverse proxy |
| **Docker Volumes** | Persistent storage for uploads, vectors, and DB |

---

## 📚 What I Have Learned

Building Talk2Doc was a hands-on deep dive across the full modern AI application stack. Key takeaways:

### 🤖 RAG & AI Engineering
- How Retrieval-Augmented Generation works end-to-end: chunking documents, generating embeddings, storing in a vector DB, and retrieving relevant context for each query
- The importance of **stable document labeling** — mapping vector store chunk IDs back to user-visible "Doc N" references to produce accurate, consistent citations
- Handling **streaming LLM responses** through SSE and how to propagate source metadata alongside streamed tokens

### ⚙️ Backend Architecture
- Designing **async FastAPI** applications with SQLAlchemy async sessions and the pitfalls of session lifecycle management (e.g., why explicit `db.commit()` calls are critical to prevent silent data loss)
- Implementing **plan enforcement** cleanly at the API layer without polluting business logic
- Managing **race conditions** in file upload + processing pipelines and how to eliminate them with proper transaction boundaries
- Using **Redis** for per-user rate limiting with atomic counters

### 🖼️ Frontend & UX Engineering
- Building a **whole-page theme system** without refactoring every component — using CSS attribute-contains selectors (`[class*="bg-zinc-9"]`) to override Tailwind utilities globally from a single `data-theme` attribute on `<html>`
- Preventing **flash of wrong theme** with a synchronous inline script in `index.html` that reads `localStorage` before the first paint
- Using the **Web Audio API** to generate notification sounds programmatically (no audio files needed)
- Implementing **Server-Sent Events** on both ends — FastAPI `StreamingResponse` and a custom React `useSSEChat` hook with abort support

### 🏗️ DevOps & Production Thinking
- Structuring a **multi-service Docker Compose** application with health checks and dependency ordering
- The critical role of **named Docker volumes** for persistent data — understanding which paths (uploads, ChromaDB, PostgreSQL) must be mounted to survive container rebuilds
- Managing **database migrations** across environments with Alembic

---

## 🚀 Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/t-hin241/Knowledge-Based-Chatbot.git
cd Knowledge-Based-Chatbot

# 2. Set up environment variables
cp .env.example .env
# Fill in: GROQ_API_KEY, POSTGRES_PASSWORD, SECRET_KEY

# 3. Start all services
docker compose up --build

# 4. Open the app
open http://localhost
```

---

## 📁 Project Structure

```
talk2doc-bot/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # REST endpoints (auth, chat, documents)
│   │   ├── core/            # Config, security, dependencies
│   │   ├── db/              # Alembic migrations, session factory
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   └── services/        # RAG engine, vector store, doc processor
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/             # Typed API clients
│   │   ├── components/      # Reusable UI components
│   │   ├── hooks/           # Custom React hooks (useSSEChat)
│   │   ├── pages/           # Dashboard, Login, Register, Profile
│   │   ├── store/           # Zustand auth store
│   │   └── index.css        # Design system + theme tokens
│   ├── index.html
│   └── Dockerfile
└── docker-compose.yml
```

---

<div align="center">
  <sub>Built with ❤️ using FastAPI, React, and LLaMA 3 via Groq</sub>
</div>
