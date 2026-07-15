'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Trash2, Zap, Clock, Webhook, Hand, Loader2 } from 'lucide-react';
import type { DbGtmAgent } from '@/types/database';
import { cn } from '@/lib/utils';

const TRIGGER_ICON = { manual: Hand, schedule: Clock, webhook: Webhook } as const;

export function AgentCard({
  agent,
  onActivate,
  onDelete,
  onRun,
}: {
  agent: DbGtmAgent;
  onActivate: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRun: (id: string, inputs: Record<string, string>) => Promise<string>;
}) {
  const [busy, setBusy] = useState<'activate' | 'delete' | 'run' | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const TriggerIcon = TRIGGER_ICON[agent.trigger];
  const inputFields = Object.keys(agent.input_schema || {});

  const handleRun = async () => {
    const inputs: Record<string, string> = {};
    for (const field of inputFields) {
      const meta = agent.input_schema[field];
      const value = window.prompt(`${field}${meta?.description ? ` — ${meta.description}` : ''}`);
      if (value === null) return;
      inputs[field] = value;
    }
    setBusy('run');
    setResult(null);
    try {
      const answer = await onRun(agent.id, inputs);
      setResult(answer);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-4 border-border/50 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-sm">{agent.name}</h3>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{agent.description}</p>
        </div>
        <Badge
          variant={agent.status === 'active' ? 'default' : agent.status === 'disabled' ? 'outline' : 'secondary'}
          className="shrink-0"
        >
          {agent.status}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1">
        {agent.toolkits.map((tk) => (
          <Badge key={tk} variant="outline" className="text-[10px]">
            {tk}
          </Badge>
        ))}
        {agent.toolkits.length === 0 && (
          <Badge variant="outline" className="text-[10px]">
            web only
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <TriggerIcon className="size-3" />
        <span>{agent.trigger}{agent.schedule ? ` (${agent.schedule})` : ''}</span>
        {agent.last_run_at && (
          <span className="ml-auto">last run {new Date(agent.last_run_at).toLocaleString()}</span>
        )}
      </div>

      {result && (
        <div className="text-xs bg-muted/50 rounded-lg p-2 max-h-32 overflow-auto whitespace-pre-wrap">
          {result}
        </div>
      )}

      <div className="flex gap-1.5 mt-auto">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={busy !== null}
          onClick={handleRun}
        >
          {busy === 'run' ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          Run
        </Button>
        {agent.status === 'draft' && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={async () => {
              setBusy('activate');
              try {
                await onActivate(agent.id);
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === 'activate' ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className={cn('text-destructive')}
          disabled={busy !== null}
          onClick={async () => {
            if (!window.confirm(`Delete "${agent.name}"?`)) return;
            setBusy('delete');
            try {
              await onDelete(agent.id);
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === 'delete' ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      </div>
    </Card>
  );
}
