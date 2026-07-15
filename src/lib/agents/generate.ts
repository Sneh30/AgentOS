import { generateAgentDefinition } from '../google';
import { GTM_TOOLKIT_ALLOWLIST, isGtmToolkit } from '../gtm-toolkits';
import { createGtmAgent } from './definitions';
import type { DbGtmAgent } from '@/types/database';

export interface GenerateAgentResult {
  agent: DbGtmAgent;
  strippedToolkits: string[];
}

// NL description -> draft gtm_agents row. Every toolkit the model proposes is checked
// against the allowlist — anything outside it is stripped and surfaced as a warning,
// never silently granted.
export async function generateAndSaveAgent(
  description: string,
  createdBy?: string
): Promise<GenerateAgentResult | { error: string }> {
  const allowedSlugs = GTM_TOOLKIT_ALLOWLIST.map((t) => t.slug);
  const result = await generateAgentDefinition(description, allowedSlugs);

  if ('error' in result) {
    return { error: result.error };
  }

  const { plan } = result;
  const strippedToolkits: string[] = [];
  const toolkits = plan.toolkits.filter((slug) => {
    const ok = isGtmToolkit(slug);
    if (!ok) strippedToolkits.push(slug);
    return ok;
  });

  const agent = await createGtmAgent({
    created_by: createdBy,
    name: plan.name,
    description: plan.description,
    goal_template: plan.goalTemplate,
    toolkits,
    input_schema: plan.inputSchema,
    trigger: plan.suggestedTrigger,
    schedule: plan.suggestedTrigger === 'schedule' ? plan.suggestedSchedule : undefined,
    status: 'draft',
    source: 'generated',
  });

  return { agent, strippedToolkits };
}
