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
    ? `\n\nBuilt-in tools (call these directly by name with the input shape shown, no auth needed):\n${customTools
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

export interface AgentDefinitionPlan {
  name: string;
  description: string;
  goalTemplate: string;
  toolkits: string[];
  inputSchema: Record<string, { type: string; description?: string; optional?: boolean }>;
  suggestedTrigger: 'manual' | 'schedule' | 'webhook';
  suggestedSchedule?: string;
}

// Turns a plain-English ask ("find LinkedIn posts mentioning our product") into a
// declarative gtm_agents row: goal template, required toolkits, input schema, suggested
// trigger. No code is generated — only a JSON config the executor already knows how to run.
export async function generateAgentDefinition(
  description: string,
  allowedToolkits: string[]
): Promise<{ plan: AgentDefinitionPlan } | { error: string }> {
  if (!GOOGLE_API_KEY) {
    return { error: 'GOOGLE_API_KEY not configured' };
  }

  const systemPrompt = `You design reusable GTM agent definitions for a GTM automation platform. Given a plain-language description of a workflow, design a declarative agent — NOT code.

Return ONLY valid JSON, no markdown fences, no explanation:
{
  "name": "Short Title Case Name",
  "description": "one sentence describing what this agent does",
  "goalTemplate": "an instruction for the task planner, with {variable} placeholders for each input, e.g. 'Find LinkedIn posts mentioning {product_name} in the last {lookback_days} days'",
  "toolkits": ["toolkit_slug", ...],
  "inputSchema": { "field_name": { "type": "string|number|boolean", "description": "...", "optional": false } },
  "suggestedTrigger": "manual|schedule|webhook",
  "suggestedSchedule": "cron expression, only if suggestedTrigger is schedule, e.g. '0 9 * * *' for daily 9am"
}

ALLOWED TOOLKITS (only ever list slugs from this set — the agent can also always use browser_search/browser_scrape and memory, those are implicit and should NOT be listed in "toolkits"):
${allowedToolkits.join(', ')}

Keep the agent narrowly scoped to exactly what was asked. Prefer "manual" trigger unless the description implies recurring monitoring (e.g. "daily", "watch for", "alert me when").`;

  const result = await callGoogle(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Design a GTM agent for this workflow:\n\n"${description}"` },
    ],
    { temperature: 0.2, maxOutputTokens: 1024 }
  );

  if ('error' in result) {
    return { error: result.error };
  }

  try {
    const plan = extractJSON<AgentDefinitionPlan>(result.content);
    if (!plan.name || !plan.goalTemplate) {
      return { error: `Invalid agent definition: ${JSON.stringify(plan).substring(0, 200)}` };
    }
    return { plan };
  } catch (e) {
    return { error: `Failed to parse agent definition: ${e instanceof Error ? e.message : 'Unknown error'}` };
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
