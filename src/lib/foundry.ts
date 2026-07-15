import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { z } from 'zod';
import { getSupabase } from './database';
import {
  getRegisteredTools,
  registerTool,
  unregisterTool,
  executeTool,
  allowToolByDefault,
  isValidUrl,
  type BaseTool,
} from './tools-enhanced';
import { fixToolCode, type ToolPlan } from './google';
import type { DbGeneratedTool } from '@/types/database';

const GENERATED_DIR = path.join(process.cwd(), 'src', 'lib', 'tools', 'generated');

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || `tool_${Date.now()}`;
}

// --- Step: search existing tools before building a new one -----------------

export interface SimilarTool {
  name: string;
  description: string;
  source: 'built-in' | 'generated';
}

export async function findSimilarExistingTool(description: string): Promise<SimilarTool | null> {
  const words = description.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  if (words.length === 0) return null;
  const threshold = Math.min(2, words.length);

  for (const tool of getRegisteredTools()) {
    const haystack = `${tool.name} ${tool.description}`.toLowerCase();
    if (words.filter((w) => haystack.includes(w)).length >= threshold) {
      return { name: tool.name, description: tool.description, source: 'built-in' };
    }
  }

  try {
    const { data } = await getSupabase()
      .from('generated_tools')
      .select('name, description')
      .in('status', ['registered', 'tested']);

    for (const row of data || []) {
      const haystack = `${row.name} ${row.description}`.toLowerCase();
      if (words.filter((w) => haystack.includes(w)).length >= threshold) {
        return { name: row.name, description: row.description, source: 'generated' };
      }
    }
  } catch {
    // best-effort only — never block the build flow on this
  }

  return null;
}

// --- Step: static safety scan ------------------------------------------------

export interface SafetyScanResult {
  passed: boolean;
  issues: string[];
}

const BANNED_PATTERNS: { pattern: RegExp; issue: string }[] = [
  { pattern: /\bchild_process\b/, issue: "references 'child_process'" },
  { pattern: /\brequire\s*\(/, issue: 'uses require() (not allowed in generated tools)' },
  { pattern: /\bimport\s*\(/, issue: 'uses dynamic import()' },
  { pattern: /\beval\s*\(/, issue: 'uses eval()' },
  { pattern: /\bnew\s+Function\s*\(/, issue: 'uses new Function()' },
  { pattern: /\bprocess\s*\.\s*exit\s*\(/, issue: 'calls process.exit()' },
  { pattern: /\bfs\s*\./, issue: 'accesses the filesystem (fs.*)' },
  { pattern: /['"]node:fs['"]/, issue: "imports 'node:fs'" },
  { pattern: /\bnet\s*\./, issue: 'opens raw network sockets (net.*)' },
  { pattern: /\bhttps?\s*\.\s*request\s*\(/, issue: 'uses http(s).request directly' },
];

export function runSafetyScan(code: string, dependencies: string[] = []): SafetyScanResult {
  const issues: string[] = [];

  for (const { pattern, issue } of BANNED_PATTERNS) {
    if (pattern.test(code)) issues.push(issue);
  }

  if (/\bfetch\s*\(/.test(code) && !/isValidUrl/.test(code)) {
    issues.push('calls fetch() without validating the URL via isValidUrl() first');
  }

  if (dependencies.length > 0) {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));
      const allowed = new Set(Object.keys(pkgJson.dependencies || {}));
      for (const dep of dependencies) {
        if (dep !== 'zod' && !allowed.has(dep)) {
          issues.push(`requests dependency "${dep}", which isn't already installed`);
        }
      }
    } catch {
      issues.push('could not verify dependencies against package.json');
    }
  }

  return { passed: issues.length === 0, issues };
}

// --- Sandboxed loading (shared by self-test, register, and restart reload) --

function transpile(code: string): string {
  const output = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      strict: false,
    },
  });
  return output.outputText;
}

// A generated tool composes with already-registered tools (built-in or other
// Foundry tools) through this, never by importing another tool's file directly —
// it's the same executeTool() dispatch the main agent uses, so a callee only ever
// runs if it already passed its own safety scan + self-test + Install & Register.
async function callTool(name: string, input: Record<string, unknown>, userId?: string) {
  return executeTool(name, input, userId || 'foundry-system');
}

// Runs generated TypeScript source in an isolated vm context with only 'zod'
// and the host's isValidUrl()/callTool() helpers available — never Node's real
// module resolution — so a generated tool can never reach fs/child_process/network
// sockets regardless of what it imports.
export function loadToolFromSource(code: string): BaseTool {
  const js = transpile(code);
  const sandboxModule: { exports: Record<string, unknown> } = { exports: {} };

  const sandboxRequire = (specifier: string) => {
    if (specifier === 'zod') return { z };
    if (specifier.includes('tools-enhanced')) return { isValidUrl, callTool };
    if (specifier.includes('tool-categories')) return {};
    throw new Error(`Module not allowed in generated tool sandbox: ${specifier}`);
  };

  const context = vm.createContext({
    require: sandboxRequire,
    module: sandboxModule,
    exports: sandboxModule.exports,
    console,
    fetch,
    Promise,
    Date,
    Math,
    JSON,
    URL,
    URLSearchParams,
    Error,
    TypeError,
    RangeError,
    RegExp,
    setTimeout,
    clearTimeout,
  });

  const script = new vm.Script(js, { filename: 'generated-tool.js' });
  script.runInContext(context, { timeout: 2000 });

  const tool = sandboxModule.exports?.default as BaseTool | undefined;
  if (!tool || typeof tool.execute !== 'function') {
    throw new Error('Generated module does not export a default tool instance with an execute() method');
  }
  return tool;
}

// --- Step: self-test ----------------------------------------------------------

export interface SelfTestResult {
  success: boolean;
  error?: string;
  output?: unknown;
  durationMs: number;
}

export async function selfTestTool(code: string, exampleInput: Record<string, unknown>): Promise<SelfTestResult> {
  const start = Date.now();
  try {
    const tool = loadToolFromSource(code);
    const timeoutMs = 5000;

    const result = await Promise.race([
      tool.execute(exampleInput, 'foundry-test-user'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Self-test timed out after 5s')), timeoutMs)),
    ]);

    const resultObj = result as { success?: boolean } | undefined;
    return { success: !!resultObj?.success, output: result, durationMs: Date.now() - start };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Self-test failed',
      durationMs: Date.now() - start,
    };
  }
}

// --- Step: write the artifact file -------------------------------------------

export function writeToolFile(name: string, code: string): { filePath: string; slug: string } {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  const slug = slugify(name);
  const filePath = path.join(GENERATED_DIR, `${slug}.ts`);
  fs.writeFileSync(filePath, code, 'utf-8');
  return { filePath, slug };
}

// --- Persistence --------------------------------------------------------------

async function ensureUniqueName(name: string): Promise<string> {
  const { data } = await getSupabase().from('generated_tools').select('name').eq('name', name);
  if (!data || data.length === 0) return name;

  let n = 2;
  while (true) {
    const candidate = `${name}_${n}`;
    const { data: existing } = await getSupabase().from('generated_tools').select('name').eq('name', candidate);
    if (!existing || existing.length === 0) return candidate;
    n += 1;
  }
}

export async function persistGeneratedTool(input: {
  plan: ToolPlan;
  code: string;
  dependencies: string[];
  filePath: string;
  scanResult: SafetyScanResult;
  testResult: SelfTestResult;
  userId?: string;
}): Promise<DbGeneratedTool> {
  const name = await ensureUniqueName(input.plan.name);
  const status = input.scanResult.passed && input.testResult.success ? 'tested' : 'failed';

  const { data, error } = await getSupabase()
    .from('generated_tools')
    .insert({
      created_by: input.userId,
      name,
      description: input.plan.description,
      category: input.plan.category,
      input_schema: input.plan.inputSchema,
      example_input: input.plan.exampleInput || {},
      source_code: input.code,
      file_path: input.filePath,
      dependencies: input.dependencies,
      status,
      test_result: input.testResult,
      safety_scan: input.scanResult,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as DbGeneratedTool;
}

// --- Step: fix a failed build (explicit user action) --------------------------

export interface FixResult {
  code: string;
  dependencies: string[];
  scanResult: SafetyScanResult;
  testResult: SelfTestResult;
  status: DbGeneratedTool['status'];
}

export async function fixGeneratedTool(toolId: string): Promise<FixResult | { error: string }> {
  const { data: row, error } = await getSupabase()
    .from('generated_tools')
    .select('*')
    .eq('id', toolId)
    .single();

  if (error || !row) {
    return { error: 'Tool not found' };
  }

  const issues: string[] = [...(row.safety_scan?.issues || [])];
  if (row.test_result && !row.test_result.success && row.test_result.error) {
    issues.push(`Self-test failed: ${row.test_result.error}`);
  }
  if (issues.length === 0) {
    return { error: 'No known issues to fix' };
  }

  const plan: ToolPlan = {
    name: row.name,
    description: row.description,
    category: row.category,
    inputSchema: row.input_schema,
    exampleInput: row.example_input || {},
    reasoning: '',
  };

  const existingTools = getRegisteredTools().filter((t) => !t.name.startsWith('composio_') && t.name !== row.name);
  const fixResult = await fixToolCode(plan, row.source_code, issues, existingTools);
  if ('error' in fixResult) {
    return { error: fixResult.error };
  }

  const scanResult = runSafetyScan(fixResult.code, fixResult.dependencies);
  const testResult = scanResult.passed
    ? await selfTestTool(fixResult.code, plan.exampleInput)
    : { success: false, error: 'Skipped — safety scan failed', durationMs: 0 };

  const { filePath } = writeToolFile(row.name, fixResult.code);
  const status: DbGeneratedTool['status'] = scanResult.passed && testResult.success ? 'tested' : 'failed';

  const { error: updateError } = await getSupabase()
    .from('generated_tools')
    .update({
      source_code: fixResult.code,
      dependencies: fixResult.dependencies,
      file_path: filePath,
      safety_scan: scanResult,
      test_result: testResult,
      status,
    })
    .eq('id', toolId);

  if (updateError) {
    return { error: updateError.message };
  }

  return { code: fixResult.code, dependencies: fixResult.dependencies, scanResult, testResult, status };
}

// --- Step: install & register (explicit user action) -------------------------

export async function registerGeneratedTool(toolId: string): Promise<{ success: boolean; error?: string }> {
  const { data: row, error } = await getSupabase()
    .from('generated_tools')
    .select('*')
    .eq('id', toolId)
    .single();

  if (error || !row) {
    return { success: false, error: 'Tool not found' };
  }

  if (!row.safety_scan?.passed || !row.test_result?.success) {
    return { success: false, error: 'Tool has not passed the safety scan and self-test' };
  }

  try {
    const tool = loadToolFromSource(row.source_code);
    registerTool(tool);
    allowToolByDefault(tool.name);
    await getSupabase().from('generated_tools').update({ status: 'registered' }).eq('id', toolId);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to register tool' };
  }
}

export async function unregisterGeneratedTool(toolId: string): Promise<{ success: boolean; error?: string }> {
  const { data: row } = await getSupabase().from('generated_tools').select('*').eq('id', toolId).single();

  if (row) {
    unregisterTool(row.name);
    try {
      fs.unlinkSync(row.file_path);
    } catch {
      // file may already be gone — not fatal
    }
    const { error } = await getSupabase().from('generated_tools').delete().eq('id', toolId);
    if (error) return { success: false, error: error.message };
  }

  return { success: true };
}

// --- Restart reload (called from tools-enhanced.ts's initializeTools) --------

export async function loadAllRegisteredGeneratedTools(): Promise<number> {
  const { data, error } = await getSupabase().from('generated_tools').select('*').eq('status', 'registered');
  if (error || !data) return 0;

  let loaded = 0;
  for (const row of data) {
    try {
      const tool = loadToolFromSource(row.source_code);
      registerTool(tool);
      allowToolByDefault(tool.name);
      loaded += 1;
    } catch (e) {
      console.error(`[Foundry] Failed to reload generated tool "${row.name}":`, e);
    }
  }
  return loaded;
}
