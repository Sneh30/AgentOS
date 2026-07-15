import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateClerkUser } from '@/lib/database';
import {
  storeMemory,
  recallMemories,
  isHydraConfigured,
  formatMemoryContext,
} from '@/lib/hydra';

async function searchMemoriesBroad(options: { limit?: number; userId?: string } = {}) {
  return recallMemories('*', { maxResults: options.limit || 20, alpha: 0.3, userId: options.userId });
}

export async function POST(request: NextRequest) {
  try {
    if (!isHydraConfigured()) {
      return NextResponse.json(
        { error: 'HydraDB not configured' },
        { status: 400 }
      );
    }

    const { userId: clerkUserId } = await auth();
    let dbUserId: string | undefined;
    
    if (clerkUserId) {
      const dbUser = await getOrCreateClerkUser(clerkUserId);
      dbUserId = dbUser.id;
    }

    const body = await request.json();
    const { action, text, query, maxResults } = body;

    if (action === 'store') {
      if (!text) {
        return NextResponse.json(
          { error: 'Missing text for store action' },
          { status: 400 }
        );
      }

      const result = await storeMemory(text, {
        title: body.title,
        infer: body.infer ?? true,
        taskId: body.taskId,
        userId: dbUserId,
      });

      return NextResponse.json(result);
    }

    if (action === 'recall') {
      if (!query) {
        return NextResponse.json(
          { error: 'Missing query for recall action' },
          { status: 400 }
        );
      }

      const result = await recallMemories(query, {
        maxResults: maxResults || 10,
        alpha: body.alpha ?? 0.7,
        recencyBias: body.recencyBias ?? 0.1,
        userId: dbUserId,
      });

      if (!result) {
        return NextResponse.json(
          { error: 'Failed to recall memories' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        chunks: result.chunks,
        sources: result.sources,
        context: formatMemoryContext(result),
        graphContext: result.graphContext,
      });
    }

    if (action === 'list') {
      const result = await searchMemoriesBroad({
        limit: body.limit || 50,
        userId: dbUserId,
      });

      return NextResponse.json({
        chunks: result?.chunks || [],
        sources: result?.sources || [],
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use store, recall, or list' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[API] HydraDB error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'HydraDB operation failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!isHydraConfigured()) {
      return NextResponse.json(
        { memories: [], configured: false }
      );
    }

    const { userId: clerkUserId } = await auth();
    let dbUserId: string | undefined;
    
    if (clerkUserId) {
      const dbUser = await getOrCreateClerkUser(clerkUserId);
      dbUserId = dbUser.id;
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    if (query) {
      const result = await recallMemories(query, { maxResults: limit, userId: dbUserId });
      return NextResponse.json({
        memories: result?.chunks || [],
        configured: true,
      });
    }

    const result = await searchMemoriesBroad({ limit, userId: dbUserId });
    return NextResponse.json({
      memories: result?.chunks || [],
      sources: result?.sources || [],
      configured: true,
    });
  } catch (error) {
    console.error('[API] HydraDB list error:', error);
    return NextResponse.json(
      { memories: [], configured: false, error: 'Failed to fetch memories' },
      { status: 500 }
    );
  }
}
