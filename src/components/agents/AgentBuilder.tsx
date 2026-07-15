'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import type { DbGtmAgent } from '@/types/database';

export function AgentBuilder({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<DbGtmAgent | null>(null);
  const [stripped, setStripped] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  const reset = () => {
    setDescription('');
    setDraft(null);
    setStripped([]);
    setError(null);
  };

  const handleGenerate = async () => {
    if (!description.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/agents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate agent');
      setDraft(data.agent);
      setStripped(data.strippedToolkits || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate agent');
    } finally {
      setGenerating(false);
    }
  };

  const handleActivate = async () => {
    if (!draft) return;
    setActivating(true);
    try {
      await fetch(`/api/agents/${draft.id}/activate`, { method: 'POST' });
      onCreated();
      onOpenChange(false);
      reset();
    } finally {
      setActivating(false);
    }
  };

  const handleSaveAsDraft = () => {
    onCreated();
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New GTM Agent</DialogTitle>
          <DialogDescription>
            Describe a workflow in plain English — the planner designs a reusable agent from
            it (GTM toolkits, memory, and the browser only, no code is generated).
          </DialogDescription>
        </DialogHeader>

        {!draft ? (
          <div className="space-y-3">
            <Textarea
              placeholder='e.g. "find LinkedIn posts mentioning our product, daily"'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[90px] resize-none"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium">{draft.name}</p>
              <p className="text-xs text-muted-foreground">{draft.description}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Goal</p>
              <p className="text-xs bg-muted/50 rounded-lg p-2">{draft.goal_template}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {draft.toolkits.map((tk) => (
                <Badge key={tk} variant="outline" className="text-[10px]">
                  {tk}
                </Badge>
              ))}
              {draft.toolkits.length === 0 && (
                <Badge variant="outline" className="text-[10px]">
                  web only
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Trigger: {draft.trigger}{draft.schedule ? ` (${draft.schedule})` : ''}
            </p>
            {stripped.length > 0 && (
              <div className="flex items-start gap-1.5 text-xs text-amber-500">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                <span>Not GTM toolkits, dropped: {stripped.join(', ')}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!draft ? (
            <Button onClick={handleGenerate} disabled={!description.trim() || generating}>
              {generating ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Sparkles className="size-4 mr-2" />}
              Design agent
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleSaveAsDraft}>
                Save as draft
              </Button>
              <Button onClick={handleActivate} disabled={activating}>
                {activating && <Loader2 className="size-4 mr-2 animate-spin" />}
                Activate
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
