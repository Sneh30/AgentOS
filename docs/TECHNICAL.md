# gtm-os — Technical Implementation

**The operating system for GTM teams — connecting your apps, memory, and browser into one
autonomous workspace.**

Built on Next.js 16 (App Router, React 19). It plans with an LLM, executes tools in a loop,
remembers across sessions with vector memory, and runs a library of **GTM agents** — named,
reusable workflows ("find LinkedIn posts mentioning our product", "enrich this lead list",
"draft outbound for these 20 accounts") composed entirely from GTM apps, memory, and the
browser. No general-purpose tool authoring, no non-GTM integrations.

---

## 1. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2 App Router, React 19.2, TypeScript 5 |
| UI | Tailwind v4, shadcn/Base UI, framer-motion, lucide, xterm (agent run console) |
| State | zustand (`src/store/index.ts`) |
| Auth | Clerk (`@clerk/nextjs`), Supabase auth kept as legacy path |
| DB | Supabase Postgres (`src/supabase/schema.sql`), RLS on all tables |
| LLM | Google Generative Language API (`gemini-flash-latest`), Ollama fallback |
| Vector memory | HydraDB v2 (`@hydradb/sdk`) |
| GTM apps | Composio Tool Router (`@composio/core`), restricted to a GTM toolkit allowlist |
| Browser | Firecrawl — search + scrape, first-class agent capability (not just ingest) |
| Landing page | GTM OS brand site (`/` page) |

---

## 2. Directory map

```
src/
  app/
    api/
      agent/                 # autonomous agent: create/execute/pause/resume/abort/reset
      agents/                # GTM agent library: CRUD + generate + run
        agents/[id]/run      # execute a saved agent definition
        agents/generate      # NL description -> AgentDefinition (no codegen, no sandbox)
      chat/, chat/send        # lightweight chat + full task-backed chat
      tasks/, tasks/[id]      # persisted task CRUD (Supabase)
      tools/                  # registered tool listing (built-ins + GTM toolkits)
      memory/, hydra-memory/, knowledge/, memory/corrupted
      browser/search, browser/scrape   # Firecrawl-backed browser capability
      composio/connect, composio/status  # GTM toolkit allowlist enforced here
      auth/callback, auth/session, auth/signin, auth/signout
      health/                 # LLM + DB + Hydra + Composio reachability check
      profile/preferences
    agent/ chat/ tasks/ memory/ profile/   # pages — no /foundry, no /dev
  lib/
    google.ts                 # LLM adapter: plan / intent / synthesis / agent-definition generation
    executor-enhanced.ts      # the plan→execute→replan loop (persisted tasks)
    agent/                    # orchestrator, self-correction, triggers, bg tasks, feedback
    agents/                   # GTM Agent Library: definition schema, generator, run binding
      definitions.ts          # AgentDefinition CRUD (Supabase-backed)
      generate.ts             # NL prompt -> AgentDefinition (goal, toolkits, schedule, inputs)
      run.ts                  # binds an AgentDefinition to executor-enhanced.ts with a scoped policy
    tools-enhanced.ts         # tool registry + built-in tools + meta-tools
    tool-categories.ts        # capability policy incl. GTM_TOOLKIT_ALLOWLIST
    gtm-toolkits.ts           # the allowlist: CRM, email, calendar, social, enrichment, comms
    composio/                 # router, session manager (LRU + semaphore), files, errors
    browser.ts                # Firecrawl search + scrape, used by knowledge ingest AND agent runs
    hydra.ts                  # vector memory + knowledge store
    database.ts               # Supabase data access (service-role client)
  supabase/schema.sql          # 6 tables: users, tasks, task_steps, executions, memory_nodes, gtm_agents
components/
    layout/sidebar.tsx, bottom-nav.tsx  # responsive shell — Chat / Tasks / Agent / Memory / Profile
    chat/                     # ConversationList, MessageBubble, ChatInput, AuthConnectionCard
    agents/                   # AgentCard, AgentBuilder (NL -> definition), AgentRunConsole
store/index.ts                # zustand (persisted to localStorage)
types/database.ts             # DbGtmAgent, DbMemoryNode, etc.
```

**Removed vs. the prior build:** `/foundry` page + `/api/foundry/*` + `foundry.ts` +
`generated_tools` table + `src/lib/tools/generated/` + `src/components/dev/` (CodeEditor/
FileTree — only ever used by the Foundry artifact viewer). No runtime code generation, no
`node:vm` sandbox, no self-written tools. Every capability the agent has comes from a fixed
built-in set, the GTM toolkit allowlist via Composio, or the browser layer.

---

## 3. Data model (`src/supabase/schema.sql`)

- **users** — `id` (= `auth.users.id`), `clerk_id` (unique, indexed), `preferences` jsonb.
- **tasks** — `input`, `plan` jsonb, `result` jsonb, status ∈ pending|running|success|failed,
  nullable `agent_id` FK when the task is a run of a saved GTM agent.
- **task_steps** — one row per tool invocation: `tool_name`, `tool_input`, `tool_output`, status.
- **executions** — append-only audit log of every action.
- **memory_nodes** — Supabase fallback memory: `type` ∈ fact|preference|context|interaction|task_summary|key_output, `importance`.
- **gtm_agents** — the Agent Library. `name`, `description`, `goal_template` (prompt with
  `{variables}`), `toolkits` (subset of the GTM allowlist this agent may call), `input_schema`
  (zod-shaped, e.g. `{ product_name, timeframe }`), `trigger` ∈ manual|schedule|webhook,
  `schedule` (cron, nullable), status ∈ draft|active|disabled, `source` ∈ template|generated|custom.

RLS: every table scoped to `auth.uid()`; `gtm_agents` is world-readable within an org (shared
agent library, same pattern the old `generated_tools` table used for shared tools).
`updated_at` triggers on users/tasks/memory_nodes/gtm_agents. `handle_new_user()` trigger
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
| `generateAgentDefinition(description, allowedToolkits)` | Turns a plain-English ask ("find LinkedIn posts mentioning our product") into a `gtm_agents` row: goal template, required toolkits (checked against the GTM allowlist), input schema, suggested trigger. **No code is generated** — only a declarative config the executor already knows how to run. |

Foundry's `planToolCapability` / `generateToolCode` / `fixToolCode` are gone — there is no
codegen contract to maintain, no sandbox, no static safety scan. `generateAgentDefinition` is
the entire "agent authoring" surface, and its output space is a JSON config, not TypeScript.

---

## 5. Execution loop — `src/lib/executor-enhanced.ts`

`createAndExecuteTask(input, userId, agentId?)` → `executeTask(task)`:

1. **Recall.** If HydraDB configured: `getContextForTaskWithKnowledge(input, userId)` →
   memory context + knowledge context, concatenated into the planner prompt. Failure is
   non-fatal (agent just runs memoryless).
2. **Plan→execute→replan loop**, `MAX_ITERATIONS = 3`:
   - `generatePlan(input, memoryContext, executionHistory, getRegisteredTools(policy))`. When
     `agentId` is set, `policy` is narrowed to that agent's `toolkits` — the planner never even
     sees toolkits the agent wasn't scoped to.
   - Zero steps + an `answer` → break with a direct answer.
   - For each step, persist a `task_steps` row, then dispatch:
     - name ∈ `BUILT_IN_TOOLS` → `executeTool(tool, input, userId, policy)`
     - name ∈ `BROWSER_TOOLS` (`browser_search`, `browser_scrape`) → `executeBrowserTool()`
     - otherwise → `executeComposioToolCall(userId, {name, parameters})`, gated by
       `isGtmToolkit(toolkitSlug)`
   - Every result (success *or* error) is pushed into `executionHistory`, fed back into the
     next `generatePlan` call — that's the replan signal.
   - Composio returning `authRequired` **halts** the task and surfaces `{type: 'REQUIRES_AUTH', authUrl}` to the UI.
   - If *every* step in an iteration failed, break rather than spin.
3. **Synthesize.** Filter out bookkeeping steps (`memory_store`, `memory_recall`, and
   `composio_search_tools` when real data exists), take the latest iteration's successes,
   join their `formatStepResult()` renderings into the final answer.
4. **Remember.** `summarizeForMemory()` → `hydraStoreMemory()`, falling back to
   `createMemoryNode()` in Supabase if HydraDB throws.

---

## 6. Tool system — `src/lib/tools-enhanced.ts` + `tool-categories.ts` + `gtm-toolkits.ts`

An in-process `Map` registry. `registerTool(tool, enabled)` / `unregisterTool` / `getTool` /
`getRegisteredTools(policy)`.

**Built-ins:** `email_send`, `memory_store`, `memory_recall`, `browser_search`,
`browser_scrape`, `http_request` (generic API calls, e.g. webhooks), plus the two
**meta-tools** `composio_search_tools` / `composio_execute_tool`, which now only ever
enumerate toolkits present in `gtm-toolkits.ts`. `github_create_issue`, `github_get_issues`,
and `twitter_post` from the prior build are dropped as non-GTM/redundant with the Composio
Twitter/X toolkit.

**`gtm-toolkits.ts` — the allowlist:**

| Category | Toolkits |
|---|---|
| CRM | Salesforce, HubSpot, Pipedrive |
| Email & calendar | Gmail, Outlook, Google Calendar |
| Social / prospecting | LinkedIn, Twitter/X |
| Enrichment | Apollo, Clearbit |
| Comms | Slack |
| Docs / sheets | Google Sheets, Notion |

**Capability policy** (`CapabilityPolicy`) gates every call:

```
category: read | write | delete | execute | mcp | composio | browser | critical
DEFAULT_POLICY: allowlist of read+safe-write tools,
                composio calls restricted to isGtmToolkit(slug),
                blocklist of workspace_delete / workspace_execute_command,
                maxSteps: 10
```

`isToolAllowed()` runs blocklist → allowlist → "is this a Composio-shaped name for an
allowlisted GTM toolkit?" `executeTool()` refuses anything that fails the check before the
tool is ever entered. A GTM agent's saved `toolkits` field further narrows this per run.

`initializeTools()` registers the built-ins only — there's nothing to load from a generated-
tools table anymore.

---

## 7. GTM Agent Library — `src/lib/agents/*` + `/api/agents/*` (replaces Agent Foundry)

This is the "`/agent` is where all the GTM agents get written" surface. It replaces Foundry's
code-generation pipeline with a **declarative agent-definition pipeline** — the model designs
a config, not code, so there's no sandbox, no safety scan, no install step.

`POST /api/agents/generate { description }`:

1. **Design.** `generateAgentDefinition(description, GTM_TOOLKIT_ALLOWLIST)` — the model
   proposes `{ name, goalTemplate, toolkits[], inputSchema, suggestedTrigger }`. Example: for
   *"find LinkedIn posts mentioning our product"* it returns a `LinkedIn Mention Finder` agent
   scoped to `toolkits: ['LINKEDIN']` plus the `browser_search` built-in, with
   `inputSchema: { product_name, lookback_days }`, `suggestedTrigger: 'schedule'` (daily).
2. **Validate.** Every toolkit the model proposes is checked against `gtm-toolkits.ts` —
   anything outside the allowlist is stripped and surfaced as a warning, never silently
   granted.
3. **Save as draft.** Row written to `gtm_agents`, status `draft`.

Then, as explicit user actions from the `/agent` UI:

- `PUT /api/agents/[id]` → edit name/goal/toolkits/schedule/inputs directly (the Agent Builder
  form doubles as an editor for generated drafts).
- `POST /api/agents/[id]/activate` → flips `draft` → `active`; only active agents are eligible
  for scheduled/webhook triggers.
- `POST /api/agents/[id]/run { inputs }` → `createAndExecuteTask(goalFilled, userId, agentId)`
  — binds the saved definition into the same plan→execute→replan loop every other task uses,
  with the policy narrowed to `toolkits`.
- `DELETE /api/agents/[id]` → removes the definition; past `tasks` rows referencing it are kept
  for history.

**Why this is safe by construction, without a sandbox:** an agent definition can only ever
call tools that already exist — GTM toolkits via Composio, `browser_search`/`browser_scrape`,
and memory. There's no code to review, scan, or self-test, because none is ever written.

**Seed library:** `claude-gtm-skills/` (§14) ships as pre-built `gtm_agents` rows with
`source: 'template'` — prospecting, outreach, deal prep, and enrichment agents a team can run
immediately or clone into a custom one via the Agent Builder.

---

## 8. Autonomous agent runtime — `src/lib/agent/*` + `/api/agent`

The longer-lived, observable execution layer the `/agent` page's run console sits on top of —
shared by both ad-hoc chat tasks and Agent Library runs.

- **`orchestrator.ts`** — `AgentOrchestrator` holds `Map<agentId, Agent>`, each with
  `status`, `currentPlan`, a rolling 20-item `thoughts[]` ring buffer, `memories[]`, and
  `metrics`. `think()` prompts the LLM for `{thought, reasoning, decision, confidence}` (memory
  context injected), `plan()` reuses `generatePlan()` and maps steps into `AgentStep`s,
  `executeStep()` wraps a dispatch, `correct()` runs the correction hook.
- **`self-correction.ts`** — `SelfCorrectionEngine`: rule-matched `CorrectionStrategy`
  (retry / backoff / alternative tool / replan / abort) with a `RetryPolicy`.
- **`background-tasks.ts`** — `BackgroundTaskManager`: priority queue, progress callbacks,
  `onComplete`/`onError` hooks. `/api/agent` fires execution into it and returns immediately;
  the UI polls `GET /api/agent?agentId=…`. Scheduled `gtm_agents` runs are enqueued here.
- **`triggers.ts`** — `TriggerSystem` for time / interval / cron / webhook triggers — the
  mechanism behind a `gtm_agents.trigger = 'schedule'` agent actually firing.
- **`memory-feedback.ts`** — `MemoryFeedbackLoop`: records outcomes, embeds them (local hashed
  embedding + cosine similarity), and mines recurring `LearningPattern`s.

All five are singletons (`getAgentSystem()` in `agent/index.ts`) — **in-process state, lost on
restart**. Durable state (the agent *definitions*, their run history) is in Supabase.

---

## 9. Memory — `src/lib/hydra.ts`

The second of the three pillars (apps / memory / browser). Two-tier, with graceful degradation.

- **Tier 1 — HydraDB v2.** `HYDRA_DB_DATABASE` (auto-created on first use), collection per
  user (`HYDRA_DB_COLLECTION`). `storeMemory(text, {userId, taskId})`,
  `recallMemories(query)` (semantic), `verifyProcessing(sourceIds)`, `listMemories`,
  `deleteMemory`.
- **Knowledge**: `storeKnowledge` / `recallKnowledge` hold ingested documents (browser-layer
  scrapes, §10) separately from episodic memory.
- `getContextForTaskWithKnowledge(input, userId)` returns both, formatted by
  `formatMemoryContext` / `formatKnowledgeContext` for prompt injection — this is how a GTM
  agent "remembers" prior runs (e.g. leads already contacted, accounts already enriched).
- **Tier 2 — Supabase `memory_nodes`.** Every Hydra write wrapped in try/catch with a
  `createMemoryNode()` fallback. `isHydraConfigured()` short-circuits the whole tier when the
  key is absent.

---

## 10. Composio integration — `src/lib/composio/*`

The "apps" pillar. Every connection surfaced to the user is filtered through
`gtm-toolkits.ts` — `/composio/connect` only ever offers to connect a GTM toolkit; there is no
path to connect an arbitrary Composio-supported app.

- **`router.ts`** — `ComposioToolRouter`: session creation, `searchTools` (pre-filtered to
  `GTM_TOOLKIT_ALLOWLIST`), `executeTool`, `initiateAuth`, mounts.
- **`session.ts`** — `SessionManager` with an **LRU cache** (`COMPOSIO_MAX_SESSIONS`, TTL
  `COMPOSIO_SESSION_TTL_SECONDS`) and a **`Semaphore`** limiting concurrent session creation.
- **`index.ts`** — `executeComposioToolCall()` is the compat shim the executor calls. On
  Composio error **4302 / "No active connection found"**, it parses the toolkit slug, calls
  `initiateComposioAuth()`, and returns `{success: false, authRequired: true, toolkit,
  authUrl}` — the executor turns this into a `REQUIRES_AUTH` task result, rendered as a
  "Connect your HubSpot" / "Connect your LinkedIn" card (`AuthConnectionCard.tsx`).
- **`errors.ts`** — typed error hierarchy + `withErrorHandling()`.
- **`config.ts`** — zod-validated env config.

---

## 11. Browser layer — `src/lib/browser.ts`

The third pillar. Firecrawl, promoted from a knowledge-ingest-only utility to a first-class
agent capability so agents can act on the open web, not just the connected apps.

- **`browser_search(query)`** — Firecrawl search, used for things no Composio toolkit covers
  directly (e.g. "find LinkedIn posts mentioning our product" starts as a web/LinkedIn search
  before any authenticated LinkedIn call is needed).
- **`browser_scrape(url)`** — fetch + clean a page into markdown, either handed straight to the
  synthesis step or piped into `storeKnowledge()` for later recall.
- Both are registered as built-ins (§6), so they participate in the same `CapabilityPolicy` and
  `executionHistory` replanning as every other tool — an agent can search the web, hit a wall,
  and replan into a Composio call (or vice versa) within one run.

---

## 12. API surface

| Route | Method | Purpose |
|---|---|---|
| `/api/agent` | GET | agent state / background tasks + metrics |
| `/api/agent` | POST | `action` ∈ create \| execute \| pause \| resume \| abort \| reset |
| `/api/agents` | GET/POST | list / create GTM agent definitions |
| `/api/agents/generate` | POST | NL description → draft `AgentDefinition` |
| `/api/agents/[id]` | GET/PUT/DELETE | read / edit / delete an agent definition |
| `/api/agents/[id]/activate` | POST | draft → active |
| `/api/agents/[id]/run` | POST | execute a saved agent with `inputs` |
| `/api/chat` | POST | lightweight chat; regex-shortcuts `remember…` / `recall…` |
| `/api/chat/send` | POST | full task-backed chat |
| `/api/tasks`, `/api/tasks/[id]` | GET/POST/DELETE | persisted tasks (incl. agent runs) |
| `/api/tools` | GET | registered tool definitions (built-ins + GTM toolkits) |
| `/api/browser/search`, `/api/browser/scrape` | POST | direct browser-layer calls |
| `/api/memory`, `/api/hydra-memory`, `/api/memory/corrupted` | CRUD | memory management |
| `/api/knowledge` | POST | browser-layer scrape → HydraDB knowledge ingest |
| `/api/composio/connect`, `/api/composio/status` | GET/POST | GTM-toolkit-only OAuth lifecycle |
| `/api/profile/preferences` | GET/PUT | user prefs |
| `/api/health` | GET | LLM + DB + Hydra + Composio reachability |
| `/api/auth/*` | GET/POST | Clerk / Supabase legacy auth |

Every mutating route starts with `const { userId: clerkUserId } = await auth()` → 401 if absent
→ `getOrCreateClerkUser(clerkUserId)` to resolve the internal UUID.

**Removed:** `/api/foundry/build`, `/api/foundry/fix`, `/api/foundry/register`,
`/api/foundry/tools`, `/api/foundry/tools/[id]`.

---

## 13. Frontend

- `app-shell.tsx` / `sidebar.tsx` / `bottom-nav.tsx` — responsive shell, `next-themes` dark
  mode. Nav: Chat (`/chat`), Tasks (`/tasks`), **Agent (`/agent`)**, Memory (`/memory`),
  Profile (`/profile`). Foundry's Hammer icon nav item is gone.
- `/` — marketing landing page: **"The operating system for GTM teams — connecting your apps,
  memory, and browser into one autonomous workspace."** Three-pillar diagram (Apps → Memory →
  Browser, orchestrated by the planner) replaces the old 5-layer architecture story.
  `CommandInput` quick-action still front and center.
- `/chat` — `ConversationList`, `MessageBubble`, `ChatInput`, `SuggestedPrompts`,
  `AuthConnectionCard`.
- `/agent` — now two panes:
  - **Library** — `AgentCard` grid: seeded templates (§7, §14) + custom agents, each showing
    name, scoped toolkits, trigger, last run. "New Agent" opens the **Agent Builder**: a
    textarea ("find LinkedIn posts mentioning our product") → `POST /api/agents/generate` →
    review/edit the proposed toolkits + input schema → Activate.
  - **Run console** (`control-panel.tsx`) — live thought stream, plan progress, metrics for
    whichever agent/task is currently running; polls `/api/agent`.
- `/memory` — browse/search/delete memories and knowledge.

---

## 14. GTM skills (`claude-gtm-skills/`)

Bundled Claude Code skill definitions for Go-to-Market workflows, now doubling as the Agent
Library's seed templates (§7):

| Skill directory | Purpose |
|---|---|
| `skills/gtm-research/` | Market research with org chart playbook |
| `skills/gtm-prospect/` | Prospecting workflows |
| `skills/gtm-prep/` | Preparation / qualification |
| `skills/gtm-outreach/` | Outreach sequences |
| `skills/gtm-onboard/` | Onboarding flows |
| `skills/gtm-deals/` | Deal management with onepager playbook |
| `email-enrichment/` | Email finding/enrichment (with evals) |

Each maps to a `gtm_agents` row with `source: 'template'` so it's runnable from `/agent` day
one, not just from Claude Code.

---

## 15. Design decisions worth knowing

- **Declarative agents, not generated code.** The Agent Library replaces Foundry's
  plan→codegen→sandbox→install pipeline with plan→JSON-config→run. There's nothing to scan or
  self-test because an agent definition can only ever call tools that already exist.
- **The allowlist is enforced at three layers, not one.** `gtm-toolkits.ts` gates what
  `composio_search_tools` can even see, what `/composio/connect` will offer to connect, and
  what an individual agent's `toolkits` field is allowed to contain. A GTM-scoped agent can't
  accidentally reach a non-GTM app even if the model hallucinates one.
- **Failure is a planning input, not an exception.** Every tool error goes into
  `executionHistory` and back into the next `generatePlan()` call — unchanged from before.
- **Auth is discovered, not configured.** A Composio 4302 mid-run becomes an auth URL in the
  chat/run console, not a 500.
- **Every external dependency is optional.** No HydraDB → Supabase memory. No Composio
  connection for a toolkit → that agent's steps fail and replan around it. Google rate-limited
  → Ollama.
- **Durable vs. ephemeral is deliberate.** Agent definitions, tasks, steps, and memories are in
  Postgres/HydraDB. Orchestrator sessions, background queues, and triggers are in-process
  singletons and reset on restart — a restart loses in-flight runs, not the agents themselves.
- **Landing page is the pitch, `/chat` and `/agent` are the product.** Users land on `/chat`
  for ad-hoc work and `/agent` to run or build a named GTM workflow.