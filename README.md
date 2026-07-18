# AgentOS — Personal Agent Operating System

> "Take your agent OS to production, faster."

An AI-powered personal agent platform that executes tasks across apps with persistent memory. Built with a layered agent architecture — planning, execution, memory, tool routing, and guard layers — all inspectable and controllable.

## Architecture

AgentOS is built as six composable layers:

| Layer | Role |
|-------|------|
| **Interface** | Chat & agent studio frontend |
| **Model Router** | OpenRouter → Google Gemini → Ollama fallback chain |
| **Simulation Engine** | Task planner (LLM-generated plans with dependency graphs) |
| **Memory Graph** | Dual-store: HydraDB (vector) + Supabase (relational) |
| **Guard Layer** | Policy enforcement, auth checks, tool allowlisting |
| **Execution Plane** | Composio (250+ app integrations), browser, memory tools |

## Features

- **LLM-powered task planning** — Describe what you want; the agent decomposes it into steps
- **Multi-model fallback** — OpenRouter (primary) → Google Gemini → Ollama (local fallback)
- **250+ app integrations** — Gmail, GitHub, Slack, Discord, Notion, Google Calendar, and more via Composio
- **Persistent memory** — HydraDB vector store + Supabase for structured recall
- **Browser automation** — Firecrawl-powered web search and scraping
- **Auth management** — Inline auth connection cards when OAuth is needed
- **Observable execution** — Real-time step-by-step task execution with status polling
- **GTM toolkits** — Pre-configured tool bundles for go-to-market workflows

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Auth | Clerk |
| Database | Supabase (Postgres) |
| Vector Memory | HydraDB v2 |
| LLM Provider | OpenRouter (primary), Google Gemini (fallback), Ollama (local fallback) |
| Tool Runtime | Composio (250+ apps), Firecrawl (browser) |
| UI | Tailwind CSS v4, Framer Motion, Base UI |
| Language | TypeScript (strict mode) |
| Deployment | Railway (free tier compatible) |

## Quick Start

### Prerequisites

- Node.js >= 20.9.0
- npm

### 1. Clone & Install

```bash
git clone https://github.com/sarthakdev14/gtm-os.git
cd gtm-os
npm install
```

### 2. Environment Variables

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description | Where to get it |
|----------|-------------|----------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key | Clerk Dashboard → API Keys |
| `CLERK_SECRET_KEY` | Clerk secret key | Clerk Dashboard → API Keys |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Supabase Dashboard → Settings → API |
| `OPENROUTER_API_KEY` | Primary LLM provider | https://openrouter.ai/keys |
| `GOOGLE_API_KEY` | Fallback LLM provider | Google AI Studio → API Keys |

Optional but recommended:

| Variable | Description |
|----------|-------------|
| `COMPOSIO_API_KEY` | 250+ app integrations (Gmail, GitHub, Slack, etc.) |
| `NEXT_PUBLIC_FIRECRAWL_API_KEY` | Browser search & scraping |
| `HYDRA_DB_API_KEY` | Vector memory for long-term recall |

### 3. Run Dev Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Clerk.

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── chat/           # Chat API (analysis → plan → execute → poll)
│   │   ├── tasks/          # Task CRUD & status polling
│   │   ├── health/         # System health endpoint
│   │   ├── composio/       # Composio OAuth connection flow
│   │   ├── memory/         # Memory CRUD
│   │   ├── agents/         # Agent definitions & execution
│   │   ├── browser/        # Firecrawl browser tools
│   │   ├── knowledge/      # Knowledge base
│   │   └── profile/        # User preferences
│   ├── chat/               # Chat UI
│   ├── tasks/              # Task list UI
│   ├── agent/              # Agent studio UI
│   ├── memory/             # Memory browser UI
│   └── profile/            # Profile & connected apps
├── lib/
│   ├── google.ts           # Unified LLM adapter (OpenRouter → Google → Ollama)
│   ├── tools-enhanced.ts   # Built-in tools (email, browser, memory)
│   ├── executor-enhanced.ts# Task execution engine
│   ├── composio/           # Composio tool router & auth
│   ├── hydra.ts            # HydraDB vector memory client
│   ├── database.ts         # Supabase client
│   └── agents/             # Agent generation & management
├── components/
│   ├── chat/               # Message bubbles, auth cards
│   └── ui/                 # Shared UI components
└── types/                  # TypeScript type definitions
```

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/health` | GET | System health (LLM, DB, Composio, Firecrawl) |
| `/api/chat/send` | POST | Analyze intent, create task, execute, return |
| `/api/tasks` | GET | List tasks |
| `/api/tasks/[id]` | GET | Poll task status & steps |
| `/api/composio/connect` | POST | Initiate OAuth for a connected app |
| `/api/composio/status` | GET | Check tool integration status |
| `/api/memory` | GET/POST | Read/write memories |
| `/api/agents` | GET/POST | List/create agent definitions |
| `/api/agents/[id]/run` | POST | Execute an agent |

## LLM Provider Chain

1. **OpenRouter** (primary) — `deepseek/deepseek-chat`
2. **Google Gemini** (fallback) — `gemini-2.0-flash-exp`
3. **Ollama** (local fallback) — `gemma4:cloud`

The health endpoint at `/api/health` reports which provider is active.

## Deployment

### Railway (recommended — free tier)

```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

The app auto-deploys with Node.js 22. Set environment variables via `railway variable set KEY=VALUE`.

### Vercel

```bash
npx vercel login
npx vercel --prod
```

Requires Node.js >= 20.9.0 in build environment. Set env vars via `vercel env add`.

## Environment

The `.env.example` file documents every configuration key. The `.env` file is gitignored — secrets never leave your machine.

## License

MIT
