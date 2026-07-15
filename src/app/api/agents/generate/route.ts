import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateClerkUser } from '@/lib/database';
import { generateAndSaveAgent } from '@/lib/agents/generate';

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { description } = await request.json();
    if (!description?.trim()) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    }

    const internalUser = await getOrCreateClerkUser(clerkUserId);
    const result = await generateAndSaveAgent(description, internalUser.id);

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Agent generate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate agent' },
      { status: 500 }
    );
  }
}
