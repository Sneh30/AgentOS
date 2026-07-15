import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getGtmAgent, updateGtmAgent, deleteGtmAgent } from '@/lib/agents/definitions';
import { isGtmToolkit } from '@/lib/gtm-toolkits';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const agent = await getGtmAgent(id);
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

    return NextResponse.json({ agent });
  } catch (error) {
    console.error('[API] Agent fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch agent' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, description, goal_template, toolkits, input_schema, trigger, schedule } = body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (goal_template !== undefined) updates.goal_template = goal_template;
    if (toolkits !== undefined) updates.toolkits = (toolkits as string[]).filter(isGtmToolkit);
    if (input_schema !== undefined) updates.input_schema = input_schema;
    if (trigger !== undefined) updates.trigger = trigger;
    if (schedule !== undefined) updates.schedule = schedule;

    const agent = await updateGtmAgent(id, updates);
    return NextResponse.json({ agent });
  } catch (error) {
    console.error('[API] Agent update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update agent' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await deleteGtmAgent(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] Agent delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete agent' },
      { status: 500 }
    );
  }
}
