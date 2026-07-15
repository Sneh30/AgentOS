import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { fixGeneratedTool } from '@/lib/foundry';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { toolId } = await request.json();
    if (!toolId) {
      return NextResponse.json({ error: 'Missing toolId' }, { status: 400 });
    }

    const result = await fixGeneratedTool(toolId);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const steps = [
      { label: 'Rewriting code', status: 'done' as const },
      {
        label: 'Safety scan',
        status: (result.scanResult.passed ? 'done' : 'failed') as 'done' | 'failed',
        detail: result.scanResult.passed ? 'No issues found' : result.scanResult.issues.join('; '),
      },
      {
        label: 'Self-test',
        status: (result.testResult.success ? 'done' : 'failed') as 'done' | 'failed',
        detail: result.testResult.success ? `Ran in ${result.testResult.durationMs}ms` : result.testResult.error,
      },
      {
        label: 'Ready',
        status: (result.status === 'tested' ? 'done' : 'failed') as 'done' | 'failed',
        detail: result.status === 'tested' ? 'Ready to install' : 'Still needs fixes',
      },
    ];

    return NextResponse.json({ ...result, steps });
  } catch (error) {
    console.error('[API] Foundry fix error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Fix failed' },
      { status: 500 }
    );
  }
}
