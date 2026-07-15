import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrCreateClerkUser } from '@/lib/database';
import { planToolCapability, generateToolCode } from '@/lib/google';
import {
  findSimilarExistingTool,
  runSafetyScan,
  selfTestTool,
  writeToolFile,
  persistGeneratedTool,
} from '@/lib/foundry';
import { getRegisteredTools } from '@/lib/tools-enhanced';

interface BuildStep {
  label: string;
  status: 'done' | 'failed';
  detail?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { description } = body;
    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json({ error: 'Missing description' }, { status: 400 });
    }

    const user = await getOrCreateClerkUser(clerkUserId);
    const steps: BuildStep[] = [];

    // Existing tools (built-in + previously-registered Foundry tools) this build can
    // compose with via callTool() instead of reimplementing their logic.
    const existingTools = getRegisteredTools().filter((t) => !t.name.startsWith('composio_'));

    // 1. Think about requirements / design the tool
    const planResult = await planToolCapability(description, existingTools);
    if ('error' in planResult) {
      steps.push({ label: 'Thinking', status: 'failed', detail: planResult.error });
      return NextResponse.json({ steps, error: planResult.error }, { status: 500 });
    }
    const { plan } = planResult;
    steps.push({
      label: 'Thinking',
      status: 'done',
      detail: plan.composesWith?.length ? `${plan.reasoning} (composes with: ${plan.composesWith.join(', ')})` : plan.reasoning,
    });

    // 2. Search existing tools
    const similar = await findSimilarExistingTool(description);
    steps.push({
      label: 'Searching existing tools',
      status: 'done',
      detail: similar
        ? `Similar ${similar.source} tool already exists: "${similar.name}"`
        : 'No close match found',
    });

    // 3. Generate code
    const codeResult = await generateToolCode(plan, existingTools);
    if ('error' in codeResult) {
      steps.push({ label: 'Generating code', status: 'failed', detail: codeResult.error });
      return NextResponse.json({ steps, plan, error: codeResult.error }, { status: 500 });
    }
    const { code, dependencies } = codeResult;
    steps.push({ label: 'Generating code', status: 'done' });

    // 4. Safety scan
    const scanResult = runSafetyScan(code, dependencies);
    steps.push({
      label: 'Safety scan',
      status: scanResult.passed ? 'done' : 'failed',
      detail: scanResult.passed ? 'No issues found' : scanResult.issues.join('; '),
    });

    // 5. Self-test — never execute code that already failed the scan
    const testResult = scanResult.passed
      ? await selfTestTool(code, plan.exampleInput || {})
      : { success: false, error: 'Skipped — safety scan failed', durationMs: 0 };
    steps.push({
      label: 'Self-test',
      status: testResult.success ? 'done' : 'failed',
      detail: testResult.success ? `Ran in ${testResult.durationMs}ms` : testResult.error,
    });

    // 6. Write the artifact file
    const { filePath, slug } = writeToolFile(plan.name, code);
    steps.push({ label: 'Writing artifact', status: 'done', detail: `src/lib/tools/generated/${slug}.ts` });

    // 7. Persist
    const saved = await persistGeneratedTool({
      plan,
      code,
      dependencies,
      filePath,
      scanResult,
      testResult,
      userId: user.id,
    });
    steps.push({
      label: 'Ready',
      status: saved.status === 'tested' ? 'done' : 'failed',
      detail: saved.status === 'tested' ? 'Ready to install' : 'Needs fixes before it can be registered',
    });

    return NextResponse.json({
      steps,
      plan,
      code,
      dependencies,
      scanResult,
      testResult,
      similar,
      toolId: saved.id,
      status: saved.status,
      fileSlug: slug,
    });
  } catch (error) {
    console.error('[API] Foundry build error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Build failed' },
      { status: 500 }
    );
  }
}
