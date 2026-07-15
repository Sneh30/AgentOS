import { z } from 'zod';
import type { ToolDefinition, ToolExecution } from '@/types/database';
import { getToolCategory, isComposioToolName, DEFAULT_POLICY, type CapabilityPolicy, type ToolCategory } from './tool-categories';
import { searchTools, executeComposioToolCall, createComposioMetaTools } from './composio/index';
import { isGtmToolkit } from './gtm-toolkits';
import { browserSearch, browserScrape } from './browser';

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  executionId?: string;
  toolName?: string;
  durationMs?: number;
  category?: ToolCategory;
}

export interface BaseTool {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: z.ZodSchema;
  execute(input: Record<string, unknown>, userId: string): Promise<ToolResult>;
}

// SSRF Protection - validate URLs
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    
    // Block private IPs
    const privatePatterns = [
      /^localhost$/i,
      /^127\.\d+\.\d+\.\d+$/,
      /^10\.\d+\.\d+\.\d+$/,
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
      /^192\.168\.\d+\.\d+$/,
      /^0\.0\.0\.0$/,
      /^::1$/,
      /^fc00:/i,
      /^fe80:/i,
    ];
    
    if (privatePatterns.some((p) => p.test(hostname))) {
      return false;
    }
    
    // Block internal hostnames
    if (hostname.includes('.internal.') || hostname.includes('.localhost.')) {
      return false;
    }
    
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// Zod to JSON Schema converter (simplified for tool definitions)
function zodToJsonSchema(schema: any): Record<string, unknown> {
  const def = schema._def;
  if (!def) return { type: 'string' };

  const typeName = def.typeName;

  if (typeName === 'ZodObject') {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const fieldSchema = value as any;
      properties[key] = zodToJsonSchema(fieldSchema);
      
      // Check if it's optional - handle nested optionals/defaults
      let isOptional = false;
      let current = fieldSchema;
      while (current) {
        if (current._def.typeName === 'ZodOptional' || current._def.typeName === 'ZodDefault') {
          isOptional = true;
          break;
        }
        if (current._def.innerType) {
          current = current._def.innerType;
        } else {
          break;
        }
      }
      
      if (!isOptional) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  if (typeName === 'ZodString') {
    return { type: 'string', description: schema.description };
  }

  if (typeName === 'ZodNumber') {
    return { type: 'number', description: schema.description };
  }

  if (typeName === 'ZodBoolean') {
    return { type: 'boolean', description: schema.description };
  }

  if (typeName === 'ZodArray') {
    return {
      type: 'array',
      items: zodToJsonSchema(def.type),
      description: schema.description,
    };
  }

  if (typeName === 'ZodEnum') {
    return {
      type: 'string',
      enum: def.values,
      description: schema.description,
    };
  }

  if (typeName === 'ZodOptional' || typeName === 'ZodDefault') {
    return zodToJsonSchema(def.innerType);
  }

  // Fallback
  return { type: 'string', description: schema.description };
}

// Tool Registry with metadata
interface RegisteredTool extends BaseTool {
  enabled: boolean;
  useCount: number;
  lastUsed?: Date;
}

const toolRegistry = new Map<string, RegisteredTool>();

// Register a tool
export function registerTool(tool: BaseTool, enabled = true): void {
  const entry = tool as RegisteredTool;
  entry.enabled = enabled;
  entry.useCount = 0;
  toolRegistry.set(tool.name, entry);
}

// Enable/disable a tool
export function setToolEnabled(name: string, enabled: boolean): void {
  const tool = toolRegistry.get(name);
  if (tool) {
    tool.enabled = enabled;
  }
}

// Remove a tool from the registry
export function unregisterTool(name: string): void {
  toolRegistry.delete(name);
}

// Get all registered tool definitions
export function getRegisteredTools(policy?: CapabilityPolicy): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  
  // Add registered tools
  toolRegistry.forEach((tool, name) => {
    if (!tool.enabled) return;
    if (policy && !isToolAllowed(name, policy)) return;
    
    tools.push({
      name: tool.name,
      description: tool.description,
      input_schema: zodToJsonSchema(tool.inputSchema),
    });
  });
  
  // Add Composio meta-tools if allowed
  if (!policy || policy.allowComposioSearch) {
    const metaTools = createComposioMetaTools();
    for (const metaTool of metaTools) {
      if (!policy || !policy.blockedTools.includes(metaTool.name)) {
        tools.push(metaTool);
      }
    }
  }
  
  return tools;
}

// Get tool by name
export function getTool(name: string): RegisteredTool | undefined {
  return toolRegistry.get(name);
}

// Check if tool exists
export function hasTool(name: string): boolean {
  return toolRegistry.has(name);
}

// Tool permission check
function isToolAllowed(name: string, policy?: CapabilityPolicy): boolean {
  if (!policy) return true;
  
  const category = getToolCategory(name);
  
  // Composio meta-tools
  if (name.startsWith('composio_')) {
    if (name === 'composio_search_tools' && policy.allowComposioSearch) return true;
    if (name === 'composio_execute_tool' && policy.allowComposioExecute) return true;
    if (name === 'composio_manage_connections') return false; // Always blocked unless YOLO
    return false;
  }

  // Raw Composio tool names (GMAIL_SEND_EMAIL, hubspot_create_contact, ...) — only GTM
  // toolkits, narrowed further to policy.allowedToolkits for a scoped agent run.
  if (isComposioToolName(name)) {
    if (!policy.allowComposioExecute || !isGtmToolkit(name)) return false;
    if (!policy.allowedToolkits) return true;
    const prefix = name.split('_')[0].toLowerCase();
    return policy.allowedToolkits.some((tk) => tk.toLowerCase() === prefix);
  }

  // Critical tools
  if (category === 'critical') return false;

  // Blocked list
  if (policy.blockedTools.includes(name)) return false;

  // Allowed list
  if (policy.allowedTools.includes(name)) return true;

  // Default based on category
  return category === 'read' || category === 'browser';
}

// Execute a tool by name
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: string,
  policy?: CapabilityPolicy
): Promise<ToolResult> {
  const startTime = Date.now();
  const tool = toolRegistry.get(toolName);
  
  // Check Composio meta-tools
  if (toolName.startsWith('composio_')) {
    return executeMetaTool(toolName, input, userId, policy);
  }
  
  if (!tool) {
    // If tool is not in registry, check if it's a Composio tool (ALL_CAPS_WITH_UNDERSCORES)
    if (isComposioToolName(toolName)) {
      // Direct execution via Composio if policy allows
      if (policy && !isToolAllowed(toolName, policy)) {
        return { success: false, error: `Tool not permitted: ${toolName}` };
      }
      
      const result = await executeComposioToolCall(userId, { name: toolName, parameters: input });
      return {
        ...result,
        error: result.error?.message,
        executionId: `${toolName}-${Date.now()}`,
        durationMs: Date.now() - startTime,
        toolName,
        category: 'composio' as any,
      };
    }
    
    return { success: false, error: `Tool not found: ${toolName}` };
  }
  
  if (!tool.enabled) {
    return { success: false, error: `Tool disabled: ${toolName}` };
  }
  
  if (policy && !isToolAllowed(toolName, policy)) {
    return { success: false, error: `Tool not permitted: ${toolName}` };
  }
  
  // Validate input against schema
  const parsed = tool.inputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: `Invalid input: ${parsed.error.message}`,
    };
  }
  
  try {
    const result = await tool.execute(input, userId);
    tool.useCount++;
    tool.lastUsed = new Date();
    
    return {
      ...result,
      executionId: `${toolName}-${Date.now()}`,
      durationMs: Date.now() - startTime,
      toolName,
      category: tool.category,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown execution error',
      executionId: `${toolName}-${Date.now()}`,
      durationMs: Date.now() - startTime,
      toolName,
      category: tool.category,
    };
  }
}

// Execute Composio meta-tools
async function executeMetaTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: string,
  policy?: CapabilityPolicy
): Promise<ToolResult> {
  const startTime = Date.now();
  
  if (toolName === 'composio_search_tools') {
    if (policy && !policy.allowComposioSearch) {
      return { success: false, error: 'Composio search not permitted' };
    }
    
    const { query, limit = 20 } = input as { query: string; limit?: number };
    const results = await searchTools(query, limit, userId);

    // GTM-only, further narrowed to policy.allowedToolkits for a scoped agent run —
    // the planner never even sees a toolkit the agent wasn't scoped to.
    const allowed = policy?.allowedToolkits;
    results.tools = results.tools.filter((t) => {
      if (!isGtmToolkit(t.name)) return false;
      if (!allowed) return true;
      const prefix = t.name.split('_')[0].toLowerCase();
      return allowed.some((tk) => tk.toLowerCase() === prefix);
    });

    return {
      success: true,
      data: results,
      durationMs: Date.now() - startTime,
      toolName,
    };
  }
  
  if (toolName === 'composio_execute_tool') {
    if (policy && !policy.allowComposioExecute) {
      return { success: false, error: 'Composio execution not permitted' };
    }
    
    const { toolName: composioToolName, input: toolInput } = input as {
      toolName: string;
      input: Record<string, unknown>;
    };
    
    if (!composioToolName) {
      return { success: false, error: 'Missing toolName' };
    }
    
    if (policy && policy.blockedTools.includes(composioToolName)) {
      return { success: false, error: `Tool blocked: ${composioToolName}` };
    }
    
    const result = await executeComposioToolCall(userId, { name: composioToolName, parameters: toolInput || {} });
    
    return {
      ...result,
      error: result.error?.message,
      durationMs: Date.now() - startTime,
      toolName,
    };
  }
  
  if (toolName === 'composio_manage_connections') {
    return { success: false, error: 'Connection management requires YOLO mode' };
  }
  
  return { success: false, error: `Unknown meta-tool: ${toolName}` };
}

// Built-in tools with Zod schemas
const browserSearchSchema = z.object({
  query: z.string().describe('Search query'),
  limit: z.number().optional().default(5),
});

export class BrowserSearchTool implements BaseTool {
  name = 'browser_search';
  description = 'Search the open web (used when no connected GTM toolkit covers this directly)';
  category: ToolCategory = 'browser';
  inputSchema = browserSearchSchema;

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const { query, limit = 5 } = input as z.infer<typeof browserSearchSchema>;
    const result = await browserSearch(query, limit);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: { query, results: result.results } };
  }
}

const browserScrapeSchema = z.object({
  url: z.string().url().describe('URL to fetch and clean into markdown'),
});

export class BrowserScrapeTool implements BaseTool {
  name = 'browser_scrape';
  description = 'Fetch a page and return its content as clean markdown';
  category: ToolCategory = 'browser';
  inputSchema = browserScrapeSchema;

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const { url } = input as z.infer<typeof browserScrapeSchema>;
    if (!isValidUrl(url)) return { success: false, error: 'Invalid or prohibited URL' };
    const result = await browserScrape(url);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, data: { url, title: result.title, markdown: result.markdown } };
  }
}

const httpRequestSchema = z.object({
  url: z.string().url().describe('HTTP URL to request'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional().default('GET'),
  headers: z.record(z.string(), z.string()).optional().describe('HTTP headers'),
  body: z.unknown().optional().describe('Request body'),
});

export class HTTPRequestTool implements BaseTool {
  name = 'http_request';
  description = 'Make HTTP requests to external APIs';
  category: ToolCategory = 'read';
  inputSchema = httpRequestSchema;

  async execute(input: Record<string, unknown>, userId: string): Promise<ToolResult> {
    const { url, method = 'GET', headers = {}, body } = input as z.infer<typeof httpRequestSchema>;
    
    // SSRF Protection
    if (!isValidUrl(url)) {
      return { success: false, error: 'Invalid or prohibited URL' };
    }

    try {
      const response = await fetch(url, {
        method,
        headers: headers as Record<string, string>,
        body: body ? JSON.stringify(body) : undefined,
      });

      const contentType = response.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      return {
        success: true,
        data: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: data,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'HTTP request failed',
      };
    }
  }
}

const memoryStoreSchema = z.object({
  content: z.string().describe('Content to store'),
  type: z.enum(['fact', 'preference', 'context', 'interaction', 'task_summary']).optional().default('context'),
  importance: z.number().min(1).max(10).optional().default(5),
  source: z.string().optional(),
});

export class MemoryStoreTool implements BaseTool {
  name = 'memory_store';
  description = 'Store information in persistent memory';
  category: ToolCategory = 'write';
  inputSchema = memoryStoreSchema;

  async execute(input: Record<string, unknown>, userId: string): Promise<ToolResult> {
    const { content, type = 'context', importance = 5, source } = input as z.infer<typeof memoryStoreSchema>;
    const text = (input.text as string) || content;
    
    if (!text) {
      return {
        success: false,
        error: 'Invalid input: content or text is required',
      };
    }
    
    return {
      success: true,
      data: {
        stored: true,
        content: text,
        type,
        importance,
        source,
        stored_at: new Date().toISOString(),
      },
    };
  }
}

const memoryRecallSchema = z.object({
  query: z.string().optional().describe('Search query'),
  type: z.enum(['fact', 'preference', 'context', 'interaction', 'task_summary']).optional(),
  limit: z.number().optional().default(10),
});

export class MemoryRecallTool implements BaseTool {
  name = 'memory_recall';
  description = 'Recall information from memory';
  category: ToolCategory = 'read';
  inputSchema = memoryRecallSchema;

  async execute(input: Record<string, unknown>, userId: string): Promise<ToolResult> {
    const { query, type, limit = 10 } = input as z.infer<typeof memoryRecallSchema>;
    
    return {
      success: true,
      data: {
        query: query || '',
        type: type || 'all',
        limit,
        results: [],
      },
    };
  }
}

const emailSendSchema = z.object({
  to: z.string().email().describe('Recipient email'),
  subject: z.string().describe('Email subject'),
  body: z.string().describe('Email body'),
});

export class EmailSendTool implements BaseTool {
  name = 'email_send';
  description = 'Send an email';
  category: ToolCategory = 'write';
  inputSchema = emailSendSchema;

  async execute(input: Record<string, unknown>, userId: string): Promise<ToolResult> {
    const { to, subject, body } = input as z.infer<typeof emailSendSchema>;
    
    const smtpHost = process.env.SMTP_HOST;
    if (!smtpHost) {
      console.log(`[EmailTool] Simulating send to ${to}: ${subject}`);
      return {
        success: true,
        data: {
          message_id: `email-${Date.now()}@anymind.ai`,
          to,
          subject,
          sent_at: new Date().toISOString(),
          simulated: true,
        },
      };
    }

    return {
      success: true,
      data: {
        message_id: `email-${Date.now()}@anymind.ai`,
        to,
        subject,
        sent_at: new Date().toISOString(),
      },
    };
  }
}

let builtInsRegistered = false;

// Initialize all built-in tools
export function initializeTools(): void {
  if (!builtInsRegistered) {
    registerTool(new HTTPRequestTool());
    registerTool(new MemoryStoreTool());
    registerTool(new MemoryRecallTool());
    registerTool(new EmailSendTool());
    registerTool(new BrowserSearchTool());
    registerTool(new BrowserScrapeTool());
    builtInsRegistered = true;

    console.log(`[Tools] Initialized ${toolRegistry.size} tools`);
  }
}

// Export for executor
export type { CapabilityPolicy, ToolCategory };
export { isToolAllowed, getToolCategory };
