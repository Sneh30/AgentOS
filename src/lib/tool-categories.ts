import { isGtmToolkit } from './gtm-toolkits';

export type ToolCategory =
  | 'read'       // View, search, retrieve - always allowed
  | 'write'      // Create, edit, modify - ask permission
  | 'delete'     // Remove, destroy - ask permission
  | 'execute'    // Run commands, code - restricted
  | 'mcp'        // MCP server tools - ask permission
  | 'composio'   // Composio meta-tools - policy-based
  | 'browser'    // Firecrawl-backed web search/scrape - always allowed
  | 'critical'; // Dangerous operations - YOLO only

export interface ToolCapability {
  name: string;
  category: ToolCategory;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  requiresAuth?: boolean;
  allowedOrigins?: string[];
}

export interface ToolPermission {
  toolName: string;
  category: ToolCategory;
  allowed: boolean;
  reason?: string;
}

export interface CapabilityPolicy {
  allowComposioSearch: boolean;
  allowComposioExecute: boolean;
  allowWorkspace: boolean;
  allowedTools: string[];
  blockedTools: string[];
  maxSteps: number;
  // When set (a GTM agent run scoped to specific toolkits), Composio calls are further
  // narrowed to this subset of the GTM allowlist — not just "any GTM toolkit".
  allowedToolkits?: string[];
}

export const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  // Read tools - always allowed
  'search_memory': 'read',
  'memory_recall': 'read',
  'http_request': 'read',
  'browser_search': 'browser',
  'browser_scrape': 'browser',

  // Write tools - ask permission
  'email_send': 'write',
  'memory_store': 'write',

  // Delete tools - ask permission
  'memory_delete': 'delete',

  // Execute tools - restricted
  'workspace_execute_command': 'execute',
  'code_interpreter': 'execute',

  // Composio meta-tools
  'composio_search_tools': 'composio',
  'composio_execute_tool': 'composio',
  'composio_manage_connections': 'composio',

  // Critical - YOLO only
  'workspace_delete': 'critical',
  'workspace_format': 'critical',
};

export const DEFAULT_POLICY: CapabilityPolicy = {
  allowComposioSearch: true,
  allowComposioExecute: true,
  allowWorkspace: false,
  allowedTools: [
    'search_memory',
    'memory_recall',
    'memory_store',
    'http_request',
    'browser_search',
    'browser_scrape',
  ],
  blockedTools: [
    'workspace_delete',
    'workspace_execute_command',
    'composio_manage_connections',
  ],
  maxSteps: 10,
};

export function getToolCategory(toolName: string): ToolCategory {
  if (isComposioToolName(toolName)) return 'composio';
  return TOOL_CATEGORIES[toolName] || 'write';
}

export function isComposioToolName(name: string): boolean {
  // Composio tools are typically all-caps with underscores: GMAIL_FETCH_EMAILS, GITHUB_CREATE_ISSUE
  return typeof name === 'string' && /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(name);
}

export function isToolAllowed(
  toolName: string,
  policy: CapabilityPolicy
): boolean {
  if (policy.blockedTools.includes(toolName)) return false;
  if (policy.allowedTools.includes(toolName)) return true;

  // Allow Composio tools if explicitly enabled in policy — but only for GTM toolkits,
  // narrowed further to policy.allowedToolkits when a run is scoped to a specific agent.
  if (policy.allowComposioExecute) {
    if (toolName.startsWith('composio_')) return true;
    if (isComposioToolName(toolName) && isGtmToolkit(toolName)) {
      if (!policy.allowedToolkits) return true;
      const prefix = toolName.split('_')[0].toLowerCase();
      return policy.allowedToolkits.some((tk) => tk.toLowerCase() === prefix);
    }
  }

  return false;
}
