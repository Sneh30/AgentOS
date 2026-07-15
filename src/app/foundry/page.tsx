'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Hammer,
  Loader2,
  CheckCircle2,
  XCircle,
  Sparkles,
  Trash2,
  PackageCheck,
  Wrench,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { PageSurface } from '@/components/layout';
import { CodeEditor } from '@/components/dev/editor';
import { FileTree } from '@/components/dev/file-tree';
import type { FileNode } from '@/components/dev/editor';

interface BuildStep {
  label: string;
  status: 'done' | 'failed';
  detail?: string;
}

interface ToolPlan {
  name: string;
  description: string;
  category: string;
  inputSchema: Record<string, unknown>;
  exampleInput: Record<string, unknown>;
  reasoning: string;
  composesWith?: string[];
}

interface BuildResponse {
  steps: BuildStep[];
  plan?: ToolPlan;
  code?: string;
  dependencies?: string[];
  scanResult?: { passed: boolean; issues: string[] };
  testResult?: { success: boolean; error?: string; durationMs: number };
  similar?: { name: string; description: string; source: string } | null;
  toolId?: string;
  status?: string;
  fileSlug?: string;
  error?: string;
}

interface GeneratedTool {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  status: string;
  use_count: number;
  last_used_at?: string;
  created_at: string;
}

const categoryVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  read: 'secondary',
  write: 'default',
  delete: 'destructive',
  execute: 'outline',
  critical: 'destructive',
};

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  registered: 'default',
  tested: 'secondary',
  failed: 'destructive',
  draft: 'outline',
  disabled: 'outline',
};

export default function FoundryPage() {
  const [description, setDescription] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildResult, setBuildResult] = useState<BuildResponse | null>(null);
  const [visibleSteps, setVisibleSteps] = useState(0);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [tools, setTools] = useState<GeneratedTool[]>([]);
  const [isLoadingTools, setIsLoadingTools] = useState(true);

  const fetchTools = useCallback(async () => {
    setIsLoadingTools(true);
    try {
      const res = await fetch('/api/foundry/tools');
      const data = await res.json();
      setTools(data.tools || []);
    } catch (e) {
      console.error('[Foundry] Failed to load tools:', e);
    } finally {
      setIsLoadingTools(false);
    }
  }, []);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  // Reveal the returned build steps sequentially to recreate the "Live Build" feel
  useEffect(() => {
    if (!buildResult?.steps?.length) {
      setVisibleSteps(0);
      return;
    }
    setVisibleSteps(0);
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setVisibleSteps(i);
      if (i >= buildResult.steps.length) clearInterval(interval);
    }, 350);
    return () => clearInterval(interval);
  }, [buildResult]);

  const handleBuild = async () => {
    if (!description.trim() || isBuilding) return;
    setIsBuilding(true);
    setBuildResult(null);
    setRegistered(false);

    try {
      const res = await fetch('/api/foundry/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      });
      const data: BuildResponse = await res.json();
      setBuildResult(data);
    } catch (e) {
      setBuildResult({
        steps: [{ label: 'Thinking', status: 'failed', detail: 'Request failed' }],
        error: e instanceof Error ? e.message : 'Build failed',
      });
    } finally {
      setIsBuilding(false);
    }
  };

  const canRegister =
    !!buildResult?.toolId &&
    buildResult.status === 'tested' &&
    buildResult.scanResult?.passed &&
    buildResult.testResult?.success &&
    !registered;

  const handleRegister = async () => {
    if (!buildResult?.toolId || !canRegister) return;
    setIsRegistering(true);
    try {
      const res = await fetch('/api/foundry/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId: buildResult.toolId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRegistered(true);
        fetchTools();
      }
    } catch (e) {
      console.error('[Foundry] Registration failed:', e);
    } finally {
      setIsRegistering(false);
    }
  };

  const canFix = !!buildResult?.toolId && buildResult.status === 'failed' && !isBuilding;

  const handleFix = async () => {
    if (!buildResult?.toolId || !canFix) return;
    setIsFixing(true);
    try {
      const res = await fetch('/api/foundry/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId: buildResult.toolId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBuildResult((prev) =>
          prev ? { ...prev, steps: [...prev.steps, { label: 'Fix', status: 'failed', detail: data.error }] } : prev
        );
        return;
      }
      setBuildResult((prev) =>
        prev
          ? {
              ...prev,
              code: data.code,
              dependencies: data.dependencies,
              scanResult: data.scanResult,
              testResult: data.testResult,
              status: data.status,
              steps: data.steps,
            }
          : prev
      );
    } catch (e) {
      console.error('[Foundry] Fix failed:', e);
    } finally {
      setIsFixing(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/foundry/tools/${id}`, { method: 'DELETE' });
      setTools((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      console.error('[Foundry] Delete failed:', e);
    }
  };

  const artifactFile: FileNode | null =
    buildResult?.code && buildResult.fileSlug
      ? {
          id: buildResult.fileSlug,
          name: `${buildResult.fileSlug}.ts`,
          type: 'file',
          content: buildResult.code,
          language: 'typescript',
        }
      : null;

  const artifactFiles: FileNode[] = artifactFile
    ? [{ id: 'generated', name: 'generated', type: 'folder', children: [artifactFile] }]
    : [];

  return (
    <PageSurface maxWidth="max-w-4xl" className="space-y-8 pb-24">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Hammer className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agent Foundry</h1>
          <p className="text-sm text-muted-foreground">Describe a capability. Anymind builds it.</p>
        </div>
      </div>

      {/* Prompt card */}
      <Card className="p-4 space-y-3">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Build a tool that reverses a string..."
          className="min-h-24 resize-none"
          disabled={isBuilding}
        />
        <div className="flex justify-end">
          <Button onClick={handleBuild} disabled={!description.trim() || isBuilding} className="gap-2">
            {isBuilding ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {isBuilding ? 'Building...' : 'Build'}
          </Button>
        </div>
      </Card>

      {/* Live Build panel */}
      {buildResult && buildResult.steps.length > 0 && (
        <Card className="p-4 space-y-1">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Live Build</h2>
          <AnimatePresence>
            {buildResult.steps.slice(0, visibleSteps).map((step, i) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                className="flex items-start gap-2 py-1.5"
              >
                {step.status === 'done' ? (
                  <CheckCircle2 className="size-4 text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium">{step.label}</p>
                  {step.detail && (
                    <p className="text-xs text-muted-foreground truncate">{step.detail}</p>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </Card>
      )}

      {/* Artifacts panel */}
      {buildResult?.plan && (
        <Card className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Artifacts</h2>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={categoryVariant[buildResult.plan.category] || 'outline'}>
              {buildResult.plan.category}
            </Badge>
            <span className="text-sm font-medium font-mono">{buildResult.plan.name}</span>
            <span className="text-xs text-muted-foreground">{buildResult.plan.description}</span>
          </div>

          {buildResult.plan.composesWith && buildResult.plan.composesWith.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Composes with: <span className="font-mono">{buildResult.plan.composesWith.join(', ')}</span>
            </p>
          )}

          {buildResult.dependencies && buildResult.dependencies.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Dependencies: {buildResult.dependencies.join(', ')}
            </p>
          )}

          <div className="flex flex-wrap gap-3 text-xs">
            <span className={buildResult.scanResult?.passed ? 'text-green-500' : 'text-destructive'}>
              Safety scan: {buildResult.scanResult?.passed ? 'passed' : 'failed'}
              {!buildResult.scanResult?.passed && buildResult.scanResult?.issues.length
                ? ` — ${buildResult.scanResult.issues.join('; ')}`
                : ''}
            </span>
            <span className={buildResult.testResult?.success ? 'text-green-500' : 'text-destructive'}>
              Self-test: {buildResult.testResult?.success ? 'passed' : 'failed'}
              {!buildResult.testResult?.success && buildResult.testResult?.error
                ? ` — ${buildResult.testResult.error}`
                : ''}
            </span>
          </div>

          {artifactFiles.length > 0 && (
            <div className="flex h-80 rounded-lg border border-border/50 overflow-hidden">
              <div className="w-48 border-r border-border/50 bg-muted/20">
                <FileTree files={artifactFiles} selectedId={artifactFile?.id} onSelect={() => {}} />
              </div>
              <div className="flex-1 min-w-0">
                <CodeEditor file={artifactFile || undefined} />
              </div>
            </div>
          )}

          <div className="flex justify-between items-center">
            <div>
              {buildResult.status === 'failed' && (
                <Button onClick={handleFix} disabled={!canFix || isFixing} variant="outline" className="gap-2">
                  {isFixing ? <Loader2 className="size-4 animate-spin" /> : <Wrench className="size-4" />}
                  {isFixing ? 'Fixing...' : 'Fix issues'}
                </Button>
              )}
            </div>
            <Button onClick={handleRegister} disabled={!canRegister || isRegistering} className="gap-2">
              {isRegistering ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PackageCheck className="size-4" />
              )}
              {registered ? 'Installed' : 'Install & Register'}
            </Button>
          </div>
        </Card>
      )}

      {/* Installed registry */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Installed Tools</h2>

        {isLoadingTools ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : tools.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tools built yet.</p>
        ) : (
          <div className="space-y-2">
            {tools.map((tool) => (
              <Card key={tool.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium font-mono truncate">{tool.name}</span>
                    <Badge variant={categoryVariant[tool.category] || 'outline'}>{tool.category}</Badge>
                    <Badge variant={statusVariant[tool.status] || 'outline'}>{tool.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{tool.description}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground font-mono tabular-nums">
                    v{tool.version} · {tool.use_count} uses
                  </span>
                  <button
                    onClick={() => handleDelete(tool.id)}
                    className="text-muted-foreground/60 hover:text-destructive transition-colors"
                    aria-label={`Delete ${tool.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageSurface>
  );
}
