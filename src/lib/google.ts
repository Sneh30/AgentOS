import type { TaskPlan, PlanStep } from '@/types/database';
import { extractJSON } from './json';

const GOOGLE_API_URL = process.env.GOOGLE_API_URL || 'https://generativelanguage.googleapis.com/v1beta/';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GOOGLE_MODEL = process.env.GOOGLE_MODEL || 'gemini-flash-latest';

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:cloud';

interface GoogleMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GoogleGenerateContentResponse {
  candidates?: {
    content?: {
      parts?: { text?: string }[];
    };
    finishReason?: string;
  }[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

function endpointFor(model: string): string {
  const base = GOOGLE_API_URL.endsWith('/') ? GOOGLE_API_URL : `${GOOGLE_API_URL}/`;
  return `${base}models/${model}:generateContent?key=${GOOGLE_API_KEY}`;
}

// Fallback used when Google returns 429 (rate limit) — routes the same
// conversation through a local Ollama instance instead.
async function callOllama(
  messages: GoogleMessage[],
  opts: { temperature?: number; maxOutputTokens?: number } = {}
): Promise<{ content: string } | { error: string }> {
  try {
    const response = await fetch(`${OLLAMA_API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false,
        options: {
          temperature: opts.temperature ?? 0.3,
          num_predict: opts.maxOutputTokens ?? 2048,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `Ollama API error: ${response.status} - ${errorText}` };
    }

    const data = await response.json();
    const content = data?.message?.content || '';

    if (!content) {
      return { error: 'No response from Ollama' };
    }

    return { content };
  } catch (error) {
    return { error: `Ollama request failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

async function callGoogle(
  messages: GoogleMessage[],
  opts: { temperature?: number; maxOutputTokens?: number; model?: string; thinkingBudget?: number } = {}
): Promise<{ content: string } | { error: string }> {
  if (!GOOGLE_API_KEY) {
    return { error: 'GOOGLE_API_KEY not configured' };
  }

  const systemInstruction = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');

  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      maxOutputTokens: opts.maxOutputTokens ?? 2048,
      // Every call site here wants fast structured output, not extended reasoning.
      // Without this, "thinking" models (e.g. gemini-3.5-flash) can burn the entire
      // maxOutputTokens budget on hidden reasoning and return finishReason=MAX_TOKENS
      // with truncated (unparseable) JSON. Callers can opt back in via opts.thinkingBudget.
      thinkingConfig: { thinkingBudget: opts.thinkingBudget ?? 0 },
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  try {
    const response = await fetch(endpointFor(opts.model || GOOGLE_MODEL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        console.warn('[Google] Rate limited (429) — falling back to Ollama:', OLLAMA_MODEL);
        return callOllama(messages, opts);
      }
      return { error: `Google API error: ${response.status} - ${errorText}` };
    }

    const data: GoogleGenerateContentResponse = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';

    if (!content) {
      return { error: 'No response from Google' };
    }

    return { content };
  } catch (error) {
    return { error: `Google request failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

export interface GeneratePlanInput {
  userInput: string;
  userContext?: {
    recentTasks?: string[];
    preferences?: string[];
    facts?: string[];
  };
  memoryContext?: string;
  availableTools?: string[];
}

export interface GeneratePlanOutput {
  plan: TaskPlan;
  reasoning: string;
  error?: never;
}

export interface GoogleError {
  error: string;
  plan?: never;
  reasoning?: never;
}

export interface PlannerTool {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
}

export async function generatePlan(
  input: string,
  memoryContext: string = '',
  executionHistory: any[] = [],
  availableTools: PlannerTool[] = []
): Promise<{ plan: TaskPlan; reasoning: string } | { error: string }> {
  if (!GOOGLE_API_KEY) {
    return { error: 'GOOGLE_API_KEY not configured' };
  }

  const customTools = availableTools.filter((t) => !t.name.startsWith('composio_'));
  const toolsSection = customTools.length > 0
    ? `\n\nCustom tools (built-in or built via Agent Foundry — call these directly by name with the input shape shown, no auth needed):\n${customTools
        .map((t) => `- ${t.name}: ${t.description}${t.input_schema ? ` Input: ${JSON.stringify(t.input_schema)}` : ''}`)
        .join('\n')}`
    : '';

  const systemPrompt = `You are a task planning AI. Generate a JSON execution plan for the given task.
Return ONLY valid JSON, no markdown fences, no explanation.

Format:
{
  "goal": "string describing the overall goal",
  "answer": "direct answer if this is a simple question, otherwise null",
  "steps": [
    {
      "id": "step_1",
      "order": 1,
      "tool": "tool_name",
      "input": { "param": "value" },
      "description": "what this step does",
      "depends_on": []
    }
  ]
}${toolsSection}

IMPORTANT: For GitHub, Gmail, Slack, Twitter, Calendar — ALWAYS use Composio tools below. NEVER use raw HTTP requests for authenticated APIs.

Composio Tools (Access to 250+ Apps: Gmail, GitHub, Slack, Discord, Twitter, Google Calendar, Notion, etc.):
- Canonical Naming: Composio slugs are usually APP_ACTION (e.g., github_create_issue, gmail_send_message, gmail_get_message). Prefer lowercase.
- Fallback: If you must guess, use lowercase APP_ACTION format.

ITERATIVE EXECUTION (AGENTIC LOOP):
You are running in a loop. You will be provided with the results of your previous tool executions for this task.
- If a previous step fetched IDs but not details (e.g. gmail_list_messages returned IDs but you need the email body), you MUST output follow-up steps using the relevant _GET_ tool (e.g. gmail_get_message) using those IDs.
- If the goal is fully met based on the execution history, output an "answer" and NO "steps".
- If the goal is NOT met, output the next logical "steps" to proceed.
- Do NOT repeat failed steps with the exact same inputs. Think carefully and adjust the tool slug or input parameters.

Always use "tool" field for tool names and "input" field for parameters.
Use "description" for a human-readable, brief explanation of what the step is doing (e.g., "Fetching recent emails", "Retrieving message content"). Do NOT just say "Executing tool_name...".

For simple questions, or if the task is thoroughly completed based on tool history — answer directly in the "answer" field with an empty steps array.`;

  const userInput = input;
  const userContext = '';
  const memorySection = memoryContext
    ? `\n\nRelevant memories from past interactions:\n${memoryContext}`
    : '';

  const historySection = executionHistory && executionHistory.length > 0
    ? `\n\nPREVIOUS ACTIONS TAKEN IN THIS LOOP:\n${JSON.stringify(executionHistory, null, 2)}\n\nReview the above results. If the final goal is met, provide 'answer' and [] steps. If you need more details from the IDs, provide the follow-up step.`
    : '';

  const messages: GoogleMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Break down this request into steps:\n\n"${userInput}"${userContext}${memorySection}${historySection}`,
    },
  ];

  console.log('[Google] Calling API with model', GOOGLE_MODEL);
  const result = await callGoogle(messages, { temperature: 0.3, maxOutputTokens: 2048 });
  if ('error' in result) {
    return { error: result.error };
  }
  const content = result.content;

  // Parse the JSON response using the robust extractor
  let parsed;
  try {
    parsed = extractJSON(content);
  } catch (e) {
    return { error: `Failed to parse Google response: ${e instanceof Error ? e.message : 'Unknown error'}. Raw: ${content.substring(0, 100)}` };
  }

  // Validate the plan structure - new format has top-level steps
  if (!parsed.steps || !Array.isArray(parsed.steps)) {
    return { error: `Invalid plan structure: ${JSON.stringify(parsed).substring(0, 200)}` };
  }

  // Ensure all required fields are present
  const validatedSteps: PlanStep[] = parsed.steps.map((step: PlanStep, index: number) => {
    const stepAny = step as unknown as Record<string, unknown>;
    return {
      id: step.id || `step_${index + 1}`,
      order: step.order || index + 1,
      tool: step.tool,
      input: stepAny.params as Record<string, unknown> || step.input || {},
      description: step.description || '',
      depends_on: step.depends_on || [],
    };
  });

  return {
    plan: {
      goal: parsed.goal || userInput,
      answer: parsed.answer || null,
      steps: validatedSteps
    },
    reasoning: parsed.reasoning || 'Plan generated successfully',
  };
}

export interface AnalyzeInputInput {
  userInput: string;
}

export interface AnalyzeIntentOutput {
  intent: 'task_create' | 'task_query' | 'memory_store' | 'memory_recall' | 'composio_tool' | 'unknown';
  entities: Record<string, string>;
  confidence: number;
}

export async function analyzeIntent(
  input: AnalyzeInputInput
): Promise<AnalyzeIntentOutput | GoogleError> {
  if (!GOOGLE_API_KEY) {
    return { error: 'GOOGLE_API_KEY not configured' };
  }

  const systemPrompt = `Analyze user input and determine their intent. Output JSON:
{
  "intent": "task_create|task_query|memory_store|memory_recall|composio_tool|unknown",
  "entities": {"key": "value"},
  "confidence": 0.0-1.0
}

Intents:
- task_create: User wants to create/execute a task
- task_query: User is asking about tasks
- memory_store: User wants to store information
- memory_recall: User wants to recall stored information
- composio_tool: User wants to use an external service (Gmail, GitHub, Slack, Twitter, Google Calendar, etc.)
- unknown: Cannot determine intent`;

  const result = await callGoogle(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input.userInput },
    ],
    { temperature: 0.1, maxOutputTokens: 512 }
  );

  if ('error' in result) {
    return { error: result.error };
  }

  const parsed = extractJSON(result.content);

  return {
    intent: parsed.intent || 'unknown',
    entities: parsed.entities || {},
    confidence: parsed.confidence || 0,
  };
}

export async function generateSynthesizedResponse(
  query: string,
  context: string,
  userFacts: string = ''
): Promise<string> {
  if (!GOOGLE_API_KEY) return 'Synthesis failed: API key missing';

  const systemPrompt = `You are a high-quality, friendly AI agent (Anymind).
Your goal is to answer the user's question using the provided context and facts.

RULES:
1. NEVER show raw memory snippets or "Question: ... Answer: ..." logs.
2. SYNTHESIZE a natural, human-like response.
3. PRIORITIZE the "Current User Profile Facts" over old, contradictory memory fragments.
4. If the context contains your past failures (e.g., "I don't know your name"), IGNORE those failures if the "Current User Profile Facts" give you the answer.
5. Be concise but warm, like a premium digital assistant.
6. Use professional markdown formatting if needed for lists, but keep it minimal.`;

  const messages: GoogleMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Current User Profile Facts:\n${userFacts}\n\nRelevant Context/Memories:\n${context}\n\nUser Question: "${query}"`,
    },
  ];

  try {
    const result = await callGoogle(messages, { temperature: 0.3, maxOutputTokens: 1024 });
    if ('error' in result) {
      console.error('[Google Synthesis] Error:', result.error);
      return 'I found some information but had trouble summarizing it.';
    }
    return result.content || "I'm not sure, I'll need more context.";
  } catch (error) {
    console.error('[Google Synthesis] Error:', error);
    return 'I encountered an error trying to remember that.';
  }
}

export interface ToolPlan {
  name: string;
  description: string;
  category: 'read' | 'write' | 'delete' | 'execute' | 'critical';
  inputSchema: Record<string, unknown>;
  exampleInput: Record<string, unknown>;
  reasoning: string;
  composesWith?: string[];
}

export interface ExistingTool {
  name: string;
  description: string;
  input_schema?: Record<string, unknown>;
}

function formatExistingTools(existingTools: ExistingTool[]): string {
  if (existingTools.length === 0) return '';
  return `\n\nEXISTING TOOLS already registered on this platform (you can compose with these instead of reimplementing their logic):\n${existingTools
    .map((t) => `- ${t.name}: ${t.description}${t.input_schema ? ` Input: ${JSON.stringify(t.input_schema)}` : ''}`)
    .join('\n')}`;
}

export async function planToolCapability(
  description: string,
  existingTools: ExistingTool[] = []
): Promise<{ plan: ToolPlan } | { error: string }> {
  if (!GOOGLE_API_KEY) {
    return { error: 'GOOGLE_API_KEY not configured' };
  }

  const systemPrompt = `You are a software architect for an AI agent platform. Given a plain-language description of a capability, design a plan for a single tool that implements it.

Return ONLY valid JSON, no markdown fences, no explanation:
{
  "name": "snake_case_tool_name",
  "description": "one sentence describing what the tool does",
  "category": "read|write|delete|execute|critical",
  "inputSchema": { "fieldName": { "type": "string|number|boolean", "description": "...", "optional": false } },
  "exampleInput": { "fieldName": "a realistic example value" },
  "reasoning": "1-2 sentences on requirements and approach",
  "composesWith": ["existing_tool_name"]
}

Category guide:
- read: fetches/looks up data, no side effects
- write: creates or modifies something
- delete: removes something
- execute: runs a computation or command
- critical: irreversible or high-risk operations (avoid unless truly necessary)

Keep the tool narrowly scoped to exactly what was asked. Prefer "execute" for pure computations (string/data transforms) that have no external side effects.

"composesWith" is an empty array unless one of the EXISTING TOOLS below would genuinely help — if this capability needs something an existing tool already does (e.g. this is "plan a trip" and an existing tool already fetches weather), list that tool's exact name there and mention the composition in "reasoning". Never list a tool that isn't in the EXISTING TOOLS section.${formatExistingTools(existingTools)}`;

  const result = await callGoogle(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Design a tool for this capability:\n\n"${description}"` },
    ],
    { temperature: 0.2, maxOutputTokens: 1024 }
  );

  if ('error' in result) {
    return { error: result.error };
  }

  try {
    const plan = extractJSON<ToolPlan>(result.content);
    if (!plan.name || !plan.description || !plan.category) {
      return { error: `Invalid tool plan: ${JSON.stringify(plan).substring(0, 200)}` };
    }
    return { plan };
  } catch (e) {
    return { error: `Failed to parse tool plan: ${e instanceof Error ? e.message : 'Unknown error'}` };
  }
}

function buildToolCodegenContract(existingTools: ExistingTool[]): string {
  return `Generate ONE file implementing this exact interface (already defined elsewhere — do not redeclare it, import it):

\`\`\`ts
import type { ToolCategory } from '../../tool-categories';
import type { BaseTool, ToolResult } from '../../tools-enhanced';
\`\`\`

interface BaseTool {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: z.ZodSchema; // from the 'zod' package
  execute(input: Record<string, unknown>, userId: string): Promise<ToolResult>;
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  toolName?: string;
  durationMs?: number;
}

STRICT RULES:
- Only import from: 'zod', '../../tool-categories' (type ToolCategory), '../../tools-enhanced' (type BaseTool, type ToolResult, and — only if needed — the functions isValidUrl and callTool).
- If the tool calls fetch(), you MUST call isValidUrl(url) first and return { success: false, error: 'Invalid or unsafe URL' } if it returns false.
- To use another already-registered tool instead of reimplementing its logic, call \`await callTool(toolName, input, userId)\` (imported from '../../tools-enhanced', same place as isValidUrl) — it returns a ToolResult. Only call tool names listed in EXISTING TOOLS below; never invent one. Always forward the \`userId\` parameter your own execute() received.
- No other imports. No 'fs', 'child_process', 'net', 'http', 'https', 'eval', 'new Function', 'process.exit', dynamic 'import(', or 'require('.
- The file's default export must be a ready-to-use instance: \`export default new ClassName();\` (not the class itself).
- execute() must never throw — catch errors internally and return { success: false, error }.
- Measure durationMs with Date.now() around the work and include it in every returned ToolResult.
- Keep the implementation as short as correctness allows.

Return ONLY valid JSON (no markdown fences) in this exact envelope, with the full file source as a properly JSON-escaped string:
{
  "code": "the complete file source as one string, with \\n for newlines",
  "dependencies": []
}

"dependencies" lists any npm package names beyond 'zod' the code needs (usually empty — prefer zero new dependencies; built-in Node/Web APIs like fetch, JSON, Math, String, Array are always available and are not "dependencies").${formatExistingTools(existingTools)}`;
}

export async function generateToolCode(
  plan: ToolPlan,
  existingTools: ExistingTool[] = []
): Promise<{ code: string; dependencies: string[] } | { error: string }> {
  if (!GOOGLE_API_KEY) {
    return { error: 'GOOGLE_API_KEY not configured' };
  }

  const systemPrompt = `You write TypeScript tool modules for an AI agent platform's runtime. ${buildToolCodegenContract(existingTools)}`;
  const userMessage = `Tool plan:\n${JSON.stringify(plan, null, 2)}\n\nGenerate the file now.${
    plan.composesWith?.length ? `\n\nThis plan calls for composing with: ${plan.composesWith.join(', ')} — use callTool() for those instead of reimplementing them.` : ''
  }`;

  const result = await callGoogle(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    { temperature: 0.2, maxOutputTokens: 4096 }
  );

  if ('error' in result) {
    return { error: result.error };
  }

  try {
    const parsed = extractJSON<{ code: string; dependencies?: string[] }>(result.content);
    if (!parsed.code || typeof parsed.code !== 'string') {
      return { error: `Invalid codegen response: ${JSON.stringify(parsed).substring(0, 200)}` };
    }
    return { code: parsed.code, dependencies: parsed.dependencies || [] };
  } catch (e) {
    return { error: `Failed to parse generated code: ${e instanceof Error ? e.message : 'Unknown error'}` };
  }
}

export async function fixToolCode(
  plan: ToolPlan,
  previousCode: string,
  issues: string[],
  existingTools: ExistingTool[] = []
): Promise<{ code: string; dependencies: string[] } | { error: string }> {
  if (!GOOGLE_API_KEY) {
    return { error: 'GOOGLE_API_KEY not configured' };
  }

  const systemPrompt = `You previously wrote a TypeScript tool module for an AI agent platform's runtime, but it failed validation. Fix it while keeping the same contract. ${buildToolCodegenContract(existingTools)}`;

  const userMessage = `Tool plan:\n${JSON.stringify(plan, null, 2)}\n\nPrevious code:\n${previousCode}\n\nIssues that MUST be fixed:\n${issues.map((i) => `- ${i}`).join('\n')}\n\nFix the code now. Keep everything that already works; only change what's needed to resolve the issues above.`;

  const result = await callGoogle(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    { temperature: 0.2, maxOutputTokens: 4096 }
  );

  if ('error' in result) {
    return { error: result.error };
  }

  try {
    const parsed = extractJSON<{ code: string; dependencies?: string[] }>(result.content);
    if (!parsed.code || typeof parsed.code !== 'string') {
      return { error: `Invalid fix response: ${JSON.stringify(parsed).substring(0, 200)}` };
    }
    return { code: parsed.code, dependencies: parsed.dependencies || [] };
  } catch (e) {
    return { error: `Failed to parse fixed code: ${e instanceof Error ? e.message : 'Unknown error'}` };
  }
}

export async function testGoogleConnection(): Promise<{ success: boolean; error?: string }> {
  if (!GOOGLE_API_KEY) {
    return { success: false, error: 'GOOGLE_API_KEY not configured' };
  }

  const result = await callGoogle(
    [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
    { maxOutputTokens: 10 }
  );

  if ('error' in result) {
    return { success: false, error: result.error };
  }

  return { success: true };
}
