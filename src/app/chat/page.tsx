'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { SuggestedPrompts } from '@/components/chat/SuggestedPrompts';
import { ConversationList } from '@/components/chat/ConversationList';
import { PageSurface } from '@/components/layout';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { ChatMessage, ChatConversation, ToolExecutionCard, TaskStepResponse } from '@/types/chat';
import { useAuth } from '@/lib/use-auth';
import { LoginModal } from '@/components/login-modal';

const CONVERSATIONS_KEY = 'anymind_conversations';
const ACTIVE_CONVERSATION_KEY = 'anymind_active_conversation';

function buildWelcomeMessages(firstName?: string | null): ChatMessage[] {
  return [
    {
      id: `system-welcome-${Date.now()}`,
      role: 'system',
      content: 'Conversation started',
      status: 'done',
      timestamp: new Date().toISOString(),
    },
    {
      id: `agent-welcome-${Date.now()}`,
      role: 'agent',
      content: `Hey ${firstName || 'there'} 👋 I'm your Anymind agent. I can fetch your emails, manage GitHub, search the web, remember things, and more. What would you like me to do?`,
      status: 'done',
      timestamp: new Date().toISOString(),
    },
  ];
}

function buildNewConversation(firstName?: string | null): ChatConversation {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: 'New conversation',
    messages: buildWelcomeMessages(firstName),
    createdAt: now,
    updatedAt: now,
  };
}

function deriveTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > 42 ? `${trimmed.slice(0, 42)}...` : trimmed;
}

export default function ChatPage() {
  const { user, isLoaded } = useUser();
  const { isAuthenticated } = useAuth();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingIntervals = useRef<Record<string, NodeJS.Timeout>>({});

  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;
  const messages = activeConversation?.messages ?? [];

  // 1. Initial State & Persistence
  useEffect(() => {
    if (isLoaded && user) {
      const storedConversations = localStorage.getItem(`${CONVERSATIONS_KEY}_${user.id}`);
      const storedActiveId = localStorage.getItem(`${ACTIVE_CONVERSATION_KEY}_${user.id}`);

      let convos: ChatConversation[] = [];
      if (storedConversations) {
        try {
          convos = JSON.parse(storedConversations);
        } catch (e) {
          console.error('[ChatPage] Conversations parse failed:', e);
        }
      }

      if (convos.length === 0) {
        const fresh = buildNewConversation(user.firstName);
        convos = [fresh];
        setActiveConversationId(fresh.id);
      } else {
        const activeExists = storedActiveId && convos.some((c) => c.id === storedActiveId);
        setActiveConversationId(activeExists ? storedActiveId! : convos[0].id);
      }

      setConversations(convos);
    }
  }, [isLoaded, user]);

  useEffect(() => {
    if (user && conversations.length > 0) {
      localStorage.setItem(`${CONVERSATIONS_KEY}_${user.id}`, JSON.stringify(conversations));
    }
  }, [conversations, user]);

  useEffect(() => {
    if (user && activeConversationId) {
      localStorage.setItem(`${ACTIVE_CONVERSATION_KEY}_${user.id}`, activeConversationId);
    }
  }, [activeConversationId, user]);

  const updateMessageInConversation = useCallback(
    (conversationId: string, messageId: string, patch: Partial<ChatMessage>) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                updatedAt: new Date().toISOString(),
                messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
              }
            : c
        )
      );
    },
    []
  );

  // 2. Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking, scrollToBottom]);

  // 3. Handlers
  const handleSend = async (messageText: string) => {
    if (!isAuthenticated) {
      setIsLoginModalOpen(true);
      return;
    }

    if (!messageText.trim() || isThinking || !activeConversationId) return;

    const conversationId = activeConversationId;

    // A. Add user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
      status: 'done',
      timestamp: new Date().toISOString(),
    };

    // B. Add thinking placeholder
    const thinkingId = crypto.randomUUID();
    const thinkingMsg: ChatMessage = {
      id: thinkingId,
      role: 'agent',
      content: '',
      status: 'thinking',
      timestamp: new Date().toISOString(),
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== conversationId) return c;
        const isFirstUserMessage = !c.messages.some((m) => m.role === 'user');
        return {
          ...c,
          title: isFirstUserMessage ? deriveTitle(messageText) : c.title,
          messages: [...c.messages, userMsg, thinkingMsg],
          updatedAt: new Date().toISOString(),
        };
      })
    );
    setIsThinking(true);

    try {
      // C. Call API
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText, conversationId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send message');

      // D. Handle response
      if (data.type === 'answer' || data.type === 'memory') {
        updateMessageInConversation(conversationId, thinkingId, { content: data.content, status: 'done' });
        setIsThinking(false);
      } else if (data.type === 'task_started') {
        updateMessageInConversation(conversationId, thinkingId, {
          content: 'Working on it...',
          status: 'streaming',
          taskId: data.taskId,
        });
        startPolling(data.taskId, thinkingId, conversationId);
      }
    } catch (error) {
      console.error('[ChatPage] Send error:', error);
      updateMessageInConversation(conversationId, thinkingId, {
        content: 'Sorry, I encountered an error. Please try again.',
        status: 'error',
      });
      setIsThinking(false);
    }
  };

  const startPolling = (taskId: string, messageId: string, conversationId: string) => {
    // Clear any existing polling for this task
    if (pollingIntervals.current[taskId]) clearInterval(pollingIntervals.current[taskId]);

    const poll = async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`);
        const data = await res.json();

        if (!res.ok) {
          clearInterval(pollingIntervals.current[taskId]);
          setIsThinking(false);
          return;
        }

        const task = data.task;
        const TERMINAL = ['success', 'failed', 'done'];

        // Update message with latest step info
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== conversationId) return c;
            return {
              ...c,
              messages: c.messages.map((m) => {
                if (m.id !== messageId) return m;

                const toolExecutions: ToolExecutionCard[] =
                  task.steps?.map((s: TaskStepResponse) => ({
                    tool: s.tool_name,
                    description: s.description || `Executing ${s.tool_name}...`,
                    status: s.status === 'success' ? 'done' : s.status === 'failed' ? 'error' : 'running',
                    formattedResult: s.tool_output ? String(s.tool_output) : undefined,
                  })) || [];

                // Detect Auth Requirement
                const authInfo = task.result?.type === 'REQUIRES_AUTH' ? task.result : undefined;

                return {
                  ...m,
                  toolExecutions,
                  authInfo,
                  content: TERMINAL.includes(task.status)
                    ? task.result?.formatted_answer || task.result?.answer || task.result?.summary || task.result?.message || 'Task completed.'
                    : task.result?.summary || 'Working on it...',
                };
              }),
            };
          })
        );

        if (TERMINAL.includes(task.status)) {
          clearInterval(pollingIntervals.current[taskId]);
          updateMessageInConversation(conversationId, messageId, {
            status: task.status === 'failed' ? 'error' : 'done',
          });
          setIsThinking(false);
        }
      } catch (e) {
        console.error('[ChatPage] Polling failed:', e);
      }
    };

    // Adaptive polling: start at 2s, reduce to 500ms as task progresses
    let pollInterval = 2000;
    pollingIntervals.current[taskId] = setInterval(poll, pollInterval);

    // Speed up polling as we get closer to completion
    const speedUpPoll = () => {
      if (pollInterval > 500) {
        pollInterval -= 500;
        clearInterval(pollingIntervals.current[taskId]);
        pollingIntervals.current[taskId] = setInterval(poll, pollInterval);
      }
    };

    // Speed up after first response
    setTimeout(speedUpPoll, 2000);
    poll(); // Initial call
  };

  const handleClear = () => {
    if (!user || !activeConversationId) return;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversationId
          ? { ...c, title: 'New conversation', messages: buildWelcomeMessages(user.firstName), updatedAt: new Date().toISOString() }
          : c
      )
    );
  };

  const handleNew = () => {
    if (!user) return;
    const fresh = buildNewConversation(user.firstName);
    setConversations((prev) => [fresh, ...prev]);
    setActiveConversationId(fresh.id);
    setIsHistoryOpen(false);
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    setIsHistoryOpen(false);
  };

  const handleDeleteConversation = (id: string) => {
    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== id);

      if (id === activeConversationId) {
        if (remaining.length > 0) {
          const next = [...remaining].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )[0];
          setActiveConversationId(next.id);
          return remaining;
        }
        if (user) {
          const fresh = buildNewConversation(user.firstName);
          setActiveConversationId(fresh.id);
          return [fresh];
        }
      }

      return remaining;
    });
  };

  const handleStop = () => {
    setIsThinking(false);
    // In a real app, we'd call an abort API
  };

  return (
    <div className="flex h-full bg-background relative overflow-hidden">
      <LoginModal open={isLoginModalOpen} onOpenChange={setIsLoginModalOpen} />

      <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-border/50 bg-card/40 backdrop-blur-xl p-4">
        <ConversationList
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={handleSelectConversation}
          onNew={handleNew}
          onDelete={handleDeleteConversation}
        />
      </aside>

      <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <SheetContent side="left" className="w-72 p-4">
          <SheetHeader className="p-0">
            <SheetTitle>Chats</SheetTitle>
          </SheetHeader>
          <ConversationList
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={handleSelectConversation}
            onNew={handleNew}
            onDelete={handleDeleteConversation}
            className="mt-2"
          />
        </SheetContent>
      </Sheet>

      <div className="flex flex-col flex-1 min-w-0 relative overflow-hidden">
        <ChatHeader
          isThinking={isThinking}
          onClear={handleClear}
          onNew={handleNew}
          onOpenHistory={() => setIsHistoryOpen(true)}
        />

        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <PageSurface maxWidth="max-w-4xl" className="space-y-2">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} className="h-4" />
          </PageSurface>
        </main>

        {(messages.length === 0 || (messages.length === 2 && messages[0].role === 'system')) && !isThinking && (
          <PageSurface maxWidth="max-w-4xl" padded={false}>
            <SuggestedPrompts onSelect={(p) => handleSend(p)} />
          </PageSurface>
        )}

        <ChatInput
          onSend={handleSend}
          onStop={handleStop}
          isThinking={isThinking}
          disabled={!isLoaded || !user}
        />
      </div>
    </div>
  );
}
