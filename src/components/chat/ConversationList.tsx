'use client';

import { formatDistanceToNowStrict } from 'date-fns';
import { MessageSquarePlus, MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ChatConversation } from '@/types/chat';

interface ConversationListProps {
  conversations: ChatConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  className?: string;
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  className,
}: ConversationListProps) {
  const sorted = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return (
    <div className={cn('flex h-full flex-col gap-3', className)}>
      <Button
        onClick={onNew}
        variant="outline"
        className="justify-start gap-2 rounded-xl border-border/60"
      >
        <MessageSquarePlus className="size-4" />
        New chat
      </Button>

      <div className="flex-1 overflow-y-auto custom-scrollbar -mx-1 px-1 space-y-1">
        {sorted.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground/60">
            No conversations yet
          </p>
        )}

        {sorted.map((conversation) => {
          const isActive = conversation.id === activeId;

          return (
            <div
              key={conversation.id}
              className={cn(
                'group relative flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
              onClick={() => onSelect(conversation.id)}
            >
              <MessageSquare className="size-3.5 shrink-0 opacity-60" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium leading-tight">
                  {conversation.title}
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  {formatDistanceToNowStrict(new Date(conversation.updatedAt), { addSuffix: true })}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conversation.id);
                }}
                className="opacity-0 group-hover:opacity-100 shrink-0 rounded-lg p-1.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-all"
                aria-label="Delete conversation"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
