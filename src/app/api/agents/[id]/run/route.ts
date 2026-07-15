import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateClerkUser } from '@/lib/database';
import { runGtmAgent } from '@/lib/agents/run';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { inputs } = await request.json().catch(() => ({ inputs: {} }));

    const internalUser = await getOrCreateClerkUser(clerkUserId);
    const result = await runGtmAgent(id, internalUser.id, inputs || {});

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Agent run error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run agent' },
      { status: 500 }
    );
  }
}
