import { testGoogleConnection } from '@/lib/google';
import { isHydraConfigured } from '@/lib/hydra';
import { getSupabase } from '@/lib/database';
import { testComposioConnection } from '@/lib/composio';

export async function GET() {
  const checks = {
    llm: { status: 'unknown' as string, error: undefined as string | undefined, provider: '' as string },
    hydradb: { status: 'unknown' as string, error: undefined as string | undefined },
    supabase: { status: 'unknown' as string, error: undefined as string | undefined },
    composio: { status: 'unknown' as string, toolCount: 0, error: undefined as string | undefined },
    firecrawl: { status: 'unknown' as string, error: undefined as string | undefined },
  };

  const llmResult = await testGoogleConnection();
  checks.llm.status = llmResult.success ? 'healthy' : 'unhealthy';
  checks.llm.error = llmResult.error;
  checks.llm.provider = process.env.OPENROUTER_API_KEY ? 'openrouter' : 'google';

  checks.hydradb.status = isHydraConfigured() ? 'healthy' : 'not_configured';

  try {
    const { error } = await getSupabase().from('users').select('id').limit(1);
    checks.supabase.status = error ? 'unhealthy' : 'healthy';
    checks.supabase.error = error?.message;
  } catch (e) {
    checks.supabase.status = 'unhealthy';
    checks.supabase.error = e instanceof Error ? e.message : 'Unknown error';
  }

  const composioResult = await testComposioConnection();
  checks.composio.status = composioResult.success ? 'healthy' : 'error';
  checks.composio.toolCount = composioResult.toolCount;
  checks.composio.error = composioResult.error;

  checks.firecrawl.status = 'not_implemented';

  const allHealthy = Object.entries(checks).every(([key, c]) => {
    if (key === 'firecrawl') return true;
    return c.status === 'healthy';
  });

  return Response.json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
}
