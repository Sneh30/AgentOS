import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { browserSearch } from '@/lib/browser';

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query, limit } = await request.json();
    if (!query?.trim()) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const result = await browserSearch(query, limit);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Browser search error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Browser search failed' },
      { status: 500 }
    );
  }
}
