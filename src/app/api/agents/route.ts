import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateClerkUser } from '@/lib/database';
import { createGtmAgent, getGtmAgents } from '@/lib/agents/definitions';
import { isGtmToolkit } from '@/lib/gtm-toolkits';

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const agents = await getGtmAgents();
    return NextResponse.json({ agents });
  } catch (error) {
    console.error('[API] Agents fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, goal_template, toolkits, input_schema, trigger, schedule } = body;

    if (!name?.trim() || !goal_template?.trim()) {
      return NextResponse.json({ error: 'name and goal_template are required' }, { status: 400 });
    }

    const strippedToolkits: string[] = [];
    const safeToolkits = (toolkits || []).filter((slug: string) => {
      const ok = isGtmToolkit(slug);
      if (!ok) strippedToolkits.push(slug);
      return ok;
    });

    const internalUser = await getOrCreateClerkUser(clerkUserId);
    const agent = await createGtmAgent({
      created_by: internalUser.id,
      name,
      description: description || '',
      goal_template,
      toolkits: safeToolkits,
      input_schema: input_schema || {},
      trigger: trigger || 'manual',
      schedule,
      status: 'draft',
      source: 'custom',
    });

    return NextResponse.json({ agent, strippedToolkits });
  } catch (error) {
    console.error('[API] Agent create error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create agent' },
      { status: 500 }
    );
  }
}
