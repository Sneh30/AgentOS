# Anymind AgentOS — Technical Implementation

An autonomous agent runtime built on Next.js 16 (App Router, React 19). It plans with an LLM,
executes tools in a loop, remembers across sessions with vector memory, and can **write and
install new tools for itself at runtime** (Agent Foundry).

---

## 1. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2 App Router, React 19.2, TypeScript 5 |
| UI | Tailwind v4, shadcn/Base UI, framer-motion, lucide, Monaco, xterm |
| State | zustand (`src/store/index.ts`) |
| Auth | Clerk (`@clerk/nextjs`), Supabase auth kept as legacy path |
| DB | Supabase Postgres (`src/supabase/schema.sql`), RLS on all tables |
| LLM | Google Generative Language API (`gemini-flash-latest`), Ollama fallback |
| Vector memory | HydraDB v2 (`@hydradb/sdk`) |
| External tools | Composio Tool Router (`@composio/core`) |
| Sandbox | `node:vm` + `typescript.transpileModule` for generated tools |
| Web ingest | Firecrawl |
| In-browser dev env | WebContainer + isomorphic-git |

---

## 2. Directory map

```
src/
  app/
    api/                    # all server logic (route handlers)
      agent/                # autonomous agent: create/execute/pause/resume/abort/reset
      chat/                 # simple chat + in-memory task/memory shim
      tasks/                # persisted task CRUD (Supabase)
      tools/                # registered tool listing
      foundry/              # build | fix | register | tools CRUD
      memory/, hydra-memory/, knowledge/
      composio/connect|status
      auth/*                # legacy Supabase OAuth callback/session
    agent/ chat/ tasks/ memory/ foundry/ profile/ home/   # pages
  lib/
    google.ts               # LLM adapter: plan / intent / synthesis / tool codegen
    executor-enhanced.ts    # the plan→execute→replan loop (persisted tasks)
    agent/                  # orchestrator, self-correction, triggers, bg tasks, feedback
    tools-enhanced.ts       # tool registry + built-in tools + meta-tools
    tool-categories.ts      # capability policy (read/write/delete/execute/…)
    foundry.ts              # tool synthesis: scan → sandbox test → persist → register
    composio/               # router, session manager (LRU + semaphore), files, errors
    hydra.ts                # vector memory + knowledge store
    database.ts             # Supabase data access
  supabase/schema.sql
```

---

## 3. Data model (`src/supabase/schema.sql`)

- **users** — `id` (= `auth.users.id`), `clerk_id` (unique, indexed), `preferences` jsonb.
  Bridges Clerk identity → internal UUID; everything downstream keys on the internal UUID.
- **tasks** — `input`, `plan` jsonb, `result` jsonb, status ∈ pending|running|success|failed.
- **task_steps** — one row per tool invocation: `tool_name`, `tool_input`, `tool_output`, status.
- **executions** — append-only audit log of every action.
- **memory_nodes** — Supabase fallback memory: `type` ∈ fact|preference|context|interaction|task_summary|key_output, `importance`.
- **generated_tools** — Agent Foundry artifacts: `source_code`, `file_path`, `input_schema`,
  `example_input`, `dependencies`, `safety_scan` jsonb, `test_result` jsonb,
  status ∈ draft|tested|registered|failed|disabled.

RLS: every table scoped to `auth.uid()`; `generated_tools` is world-readable (shared tool library).
`updated_at` triggers on users/tasks/memory_nodes/generated_tools. `handle_new_user()` trigger
auto-creates a profile row on signup.

---

## 4. LLM adapter — `src/lib/google.ts`

Single choke point for every model call.

```
callGoogle(messages, opts)
  └─ POST {GOOGLE_API_URL}/models/{GOOGLE_MODEL}:generateContent?key=…
  └─ on HTTP 429 → callOllama(messages)  # local/edge gemma4, same message shape
```

Exports, each a prompt + `extractJSON()` (`src/lib/json.ts`) parse:

| Function | Purpose |
|---|---|
| `generatePlan(input, memoryContext, executionHistory, tools)` | Returns `{ steps[], reasoning, answer? }`. `answer` with zero steps = "I can answer directly, stop looping." |
| `analyzeIntent(input)` | Cheap classifier before heavy planning |
| `generateSynthesizedResponse(...)` | Turns raw step outputs into prose |
| `planToolCapability(desc, existingTools)` | Foundry step 1 — designs a `ToolPlan` (name, category, zod-shaped `inputSchema`, `exampleInput`, `composesWith[]`) |
| `generateToolCode(plan, existingTools)` | Foundry step 3 — emits TypeScript against a fixed codegen contract |
| `fixToolCode(plan, code, issues, existingTools)` | Foundry repair pass, fed the safety-scan issues + self-test error |

The codegen contract (`buildToolCodegenContract`) is what makes generated tools safe *by
construction*: it lists the existing registered tools so the model composes via `callTool()`
instead of reimplementing them, and forbids `fs`/`child_process`/`eval`/raw sockets.

---

## 5. Execution loop — `src/lib/executor-enhanced.ts`

`createAndExecuteTask(input, userId)` → `executeTask(task)`:

1. **Recall.** If HydraDB configured: `getContextForTaskWithKnowledge(input, userId)` →
   memory context + knowledge context, concatenated into the planner prompt. Failure is
   non-fatal (agent just runs memoryless).
2. **Plan→execute→replan loop**, `MAX_ITERATIONS = 3`:
   - `generatePlan(input, memoryContext, executionHistory, getRegisteredTools())`.
   - Zero steps + an `answer` → break with a direct answer.
   - For each step, persist a `task_steps` row, then dispatch:
     - name ∈ `BUILT_IN_TOOLS` → `executeTool(tool, input, userId, DEFAULT_POLICY)`
     - otherwise → `executeComposioToolCall(userId, {name, parameters})`
   - Every result (success *or* error) is pushed into `executionHistory`, which is fed back
     into the next `generatePlan` call — that's the replan signal.
   - Composio returning `authRequired` **halts** the task and surfaces `{type: 'REQUIRES_AUTH', authUrl}` to the UI.
   - If *every* step in an iteration failed, break rather than spin.
3. **Synthesize.** Filter out bookkeeping steps (`memory_store`, `memory_recall`, and
   `composio_search_tools` when real data exists), take the latest iteration's successes,
   join their `formatStepResult()` renderings into the final answer.
4. **Remember.** `summarizeForMemory()` → `hydraStoreMemory()`, falling back to
   `createMemoryNode()` in Supabase if HydraDB throws.

`formatStepResult(tool, result)` holds the per-tool presentation logic (GitHub issue lists,
email confirmations, HTTP bodies) so the LLM never has to re-serialize raw JSON.

---

## 6. Tool system — `src/lib/tools-enhanced.ts` + `tool-categories.ts`

An in-process `Map` registry. `registerTool(tool, enabled)` / `unregisterTool` / `getTool` /
`getRegisteredTools(policy)`. `zodToJsonSchema()` converts each tool's zod schema into the
JSON Schema handed to the planner.

**Built-ins:** `github_create_issue`, `github_get_issues`, `http_request`, `memory_store`,
`memory_recall`, `email_send`, `twitter_post`, plus the two **meta-tools**
`composio_search_tools` / `composio_execute_tool` (handled specially in `executeMetaTool`, which
lets the agent discover and call any of Composio's thousands of tools without them being
pre-registered).

**Capability policy** (`CapabilityPolicy`) gates every call:

```
category: read | write | delete | execute | mcp | composio | critical
DEFAULT_POLICY: allowlist of read+safe-write tools,
                blocklist of workspace_delete / workspace_execute_command,
                allowComposioExecute: true, maxSteps: 10
```

`isToolAllowed()` runs blocklist → allowlist → "is this a Composio-shaped name
(`^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$`) and is Composio execution enabled?" `executeTool()` refuses
anything that fails the check, before the tool code is ever entered.

`initializeTools()` registers the built-ins and then calls
`loadAllRegisteredGeneratedTools()` so Foundry tools survive a server restart.

---

## 7. Agent Foundry — `src/lib/foundry.ts` + `/api/foundry/*`

The agent writing its own tools. `POST /api/foundry/build { description }` runs a 7-step
pipeline, returning a `steps[]` trace the UI renders live:

1. **Think** — `planToolCapability()` designs the tool and declares what it `composesWith`.
2. **Search existing** — `findSimilarExistingTool()` word-overlap match against the live
   registry and `generated_tools` rows, so the agent doesn't rebuild what it has.
3. **Generate code** — `generateToolCode()`.
4. **Safety scan** — `runSafetyScan()`: static regex ban on `child_process`, `require(`,
   dynamic `import(`, `eval`, `new Function`, `process.exit`, `fs.*`, `net.*`, raw
   `http.request`; requires `isValidUrl()` before any `fetch()`; and rejects any dependency
   not already in `package.json`.
5. **Self-test** — only if the scan passed. `selfTestTool()` transpiles with
   `ts.transpileModule` and runs the module in a `node:vm` context whose `require` shim
   exposes **only** `zod`, `isValidUrl`, and `callTool` — no real module resolution, so the
   code cannot reach the filesystem or sockets regardless of what it imports. 2s compile
   timeout, 5s execution timeout, run against the plan's `exampleInput`.
6. **Write artifact** — `src/lib/tools/generated/{slug}.ts`.
7. **Persist** — `generated_tools` row, status `tested` (scan+test both green) or `failed`.

Then, as explicit user actions:

- `POST /api/foundry/fix` → `fixGeneratedTool(id)` — re-prompts the model with the recorded
  scan issues + test error, re-scans, re-tests, rewrites the file.
- `POST /api/foundry/register` → `registerGeneratedTool(id)` — **refuses unless
  `safety_scan.passed && test_result.success`**, then loads the tool into the live registry,
  `allowToolByDefault(name)`, and flips status to `registered`. It is now callable by the
  planner in the very next task.

**Agent-calls-agent:** a generated tool never imports another tool's file. It calls
`callTool(name, input)`, which is the same `executeTool()` dispatch the main agent uses — so a
callee only ever runs if it itself passed scan + self-test + register.

---

## 8. Autonomous agent — `src/lib/agent/*` + `/api/agent`

A longer-lived, observable agent (the `/agent` page) layered on the same tools.

- **`orchestrator.ts`** — `AgentOrchestrator` holds `Map<agentId, Agent>`, each with
  `status`, `currentPlan`, a rolling 20-item `thoughts[]` ring buffer, `memories[]`, and
  `metrics`. `think()` prompts the LLM for `{thought, reasoning, decision, confidence}` (memory
  context injected), `plan()` reuses `generatePlan()` and maps steps into `AgentStep`s,
  `executeStep()` wraps a dispatch, `correct()` runs the correction hook.
- **`self-correction.ts`** — `SelfCorrectionEngine`: rule-matched `CorrectionStrategy`
  (retry / backoff / alternative tool / replan / abort) with a `RetryPolicy`.
- **`background-tasks.ts`** — `BackgroundTaskManager`: priority queue, progress callbacks,
  `onComplete`/`onError` hooks. `/api/agent` fires execution into it and returns immediately;
  the UI polls `GET /api/agent?agentId=…`.
- **`triggers.ts`** — `TriggerSystem` for time / interval / cron / event triggers.
- **`memory-feedback.ts`** — `MemoryFeedbackLoop`: records outcomes, embeds them (local hashed
  embedding + cosine similarity), and mines recurring `LearningPattern`s.

All five are singletons (`getAgentSystem()` in `agent/index.ts`) — **in-process state, lost on
restart**. Agent sessions are ephemeral by design; durable state is in Supabase/HydraDB.

---

## 9. Memory — `src/lib/hydra.ts`

Two-tier, with graceful degradation.

- **Tier 1 — HydraDB v2.** `HYDRA_DB_DATABASE` (auto-created on first use), collection per
  user (`HYDRA_DB_COLLECTION`). `storeMemory(text, {userId, taskId})`,
  `recallMemories(query)` (semantic), `verifyProcessing(sourceIds)` (embeddings are async —
  this polls until a source is indexed), `listMemories`, `deleteMemory`.
- **Knowledge**: `storeKnowledge` / `recallKnowledge` hold ingested documents (Firecrawl
  scrapes via `scrapeAndPrepareForIngestion`) separately from episodic memory.
- `getContextForTaskWithKnowledge(input, userId)` returns both, formatted by
  `formatMemoryContext` / `formatKnowledgeContext` for prompt injection.
- **Tier 2 — Supabase `memory_nodes`.** Every Hydra write is wrapped in try/catch with a
  `createMemoryNode()` fallback. `isHydraConfigured()` short-circuits the whole tier when the
  key is absent, so the app runs fine with no vector DB at all.

---

## 10. Composio integration — `src/lib/composio/*`

- **`router.ts`** — `ComposioToolRouter`: session creation, `searchTools`, `executeTool`,
  `initiateAuth`, mounts.
- **`session.ts`** — `SessionManager` with an **LRU cache** (`COMPOSIO_MAX_SESSIONS`, TTL
  `COMPOSIO_SESSION_TTL_SECONDS`) and a **`Semaphore`** limiting concurrent session creation;
  session IDs validated/sanitized before use.
- **`index.ts`** — `executeComposioToolCall()` is the compat shim the executor calls. Its key
  behavior: on Composio error **4302 / "No active connection found"**, it parses the toolkit
  slug out of the error message, calls `initiateComposioAuth()`, and returns
  `{success: false, authRequired: true, toolkit, authUrl}` — which the executor turns into a
  `REQUIRES_AUTH` task result and the chat UI renders as a "Connect your Gmail" card
  (`AuthConnectionCard.tsx`). Auth is thus discovered lazily, mid-task, instead of being
  pre-configured.
- **`errors.ts`** — typed error hierarchy (`AuthRequiredError`, `SessionExpiredError`,
  `ToolExecutionError`, `FileMountError`, `ApiResponseError`, `NetworkError`) + `withErrorHandling()`.
- **`config.ts`** — zod-validated env config.

---

## 11. API surface

| Route | Method | Purpose |
|---|---|---|
| `/api/agent` | GET | agent state / background tasks + metrics |
| `/api/agent` | POST | `action` ∈ create \| execute \| pause \| resume \| abort \| reset |
| `/api/chat` | POST | lightweight chat; regex-shortcuts `remember…` / `recall…` to in-memory store |
| `/api/chat/send` | POST | full task-backed chat |
| `/api/tasks`, `/api/tasks/[id]` | GET/POST/DELETE | persisted tasks |
| `/api/tools` | GET | registered tool definitions |
| `/api/foundry/build` | POST | 7-step tool synthesis |
| `/api/foundry/fix` | POST | LLM repair of a failed tool |
| `/api/foundry/register` | POST | install a `tested` tool into the live registry |
| `/api/foundry/tools`, `/api/foundry/tools/[id]` | GET/DELETE | tool library |
| `/api/memory`, `/api/hydra-memory`, `/api/memory/corrupted` | CRUD | memory management |
| `/api/knowledge` | POST | Firecrawl scrape → HydraDB knowledge ingest |
| `/api/composio/connect`, `/api/composio/status` | GET/POST | OAuth connection lifecycle |
| `/api/profile/preferences` | GET/PUT | user prefs |
| `/api/health` | GET | LLM + DB + Hydra reachability |

Every mutating route starts with `const { userId: clerkUserId } = await auth()` → 401 if absent
→ `getOrCreateClerkUser(clerkUserId)` to resolve the internal UUID.

---

## 12. Frontend

- `app-shell.tsx` / `sidebar.tsx` / `bottom-nav.tsx` — responsive shell, `next-themes` dark mode.
- `/chat` — `ConversationList`, `MessageBubble`, `ChatInput`, `SuggestedPrompts`,
  `AuthConnectionCard` (renders the `REQUIRES_AUTH` payload as a one-click connect button).
- `/agent` — `control-panel.tsx`: live thought stream, plan progress, metrics; polls `/api/agent`.
- `/foundry` — describe a capability → watch the 7 build steps stream → review generated code
  (Monaco) → **Fix** or **Install & Register**.
- `/memory` — browse/search/delete memories and knowledge.
- `src/components/dev/*` — WebContainer-backed editor, terminal (xterm), file tree, git panel,
  API client. In-browser dev environment (`src/lib/dev-environment.ts`).

---

## 13. Configuration

Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `GOOGLE_API_KEY`.

Optional (each degrades gracefully): `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS server-side),
`OLLAMA_API_URL`/`OLLAMA_MODEL` (429 fallback), `HYDRA_DB_API_KEY` (vector memory),
`COMPOSIO_API_KEY` (external tools), `NEXT_PUBLIC_FIRECRAWL_API_KEY` (web ingest),
`GITHUB_TOKEN`, `TWITTER_*`, `SMTP_*` (built-in tool credentials).

Setup: `npm i` → run `src/supabase/schema.sql` in the Supabase SQL editor → fill `.env` → `npm run dev`.

---

## 14. Design decisions worth knowing

- **Failure is a planning input, not an exception.** Every tool error goes into
  `executionHistory` and back into the next `generatePlan()` call. The agent replans around
  what broke rather than aborting.
- **Auth is discovered, not configured.** A Composio 4302 mid-task becomes an auth URL in the
  chat, not a 500.
- **Generated code is guilty until proven innocent.** Static scan → vm sandbox with a
  3-symbol `require` shim → self-test against the model's own example input → *only then* can
  a human click Install. `registerGeneratedTool()` re-checks both gates server-side.
- **Every external dependency is optional.** No HydraDB → Supabase memory. No Composio →
  built-in tools only. Google rate-limited → Ollama. The app never hard-fails on a missing key.
- **Durable vs. ephemeral is deliberate.** Tasks, steps, memories, and generated tools are in
  Postgres/HydraDB. Agent sessions, background queues, and triggers are in-process singletons
  and reset on restart.
