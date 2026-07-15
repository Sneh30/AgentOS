import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getGtmAgent, updateGtmAgent } from '@/lib/agents/definitions';

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
    const existing = await getGtmAgent(id);
    if (!existing) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    const agent = await updateGtmAgent(id, { status: 'active' });
    return NextResponse.json({ agent });
  } catch (error) {
    console.error('[API] Agent activate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to activate agent' },
      { status: 500 }
    );
  }
}
