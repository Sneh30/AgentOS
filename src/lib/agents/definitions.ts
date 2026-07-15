import { getSupabase } from '../database';
import type { DbGtmAgent } from '@/types/database';

export interface CreateGtmAgentInput {
  created_by?: string;
  name: string;
  description: string;
  goal_template: string;
  toolkits: string[];
  input_schema: DbGtmAgent['input_schema'];
  trigger: DbGtmAgent['trigger'];
  schedule?: string;
  status?: DbGtmAgent['status'];
  source: DbGtmAgent['source'];
}

export async function createGtmAgent(input: CreateGtmAgentInput): Promise<DbGtmAgent> {
  const { data, error } = await getSupabase()
    .from('gtm_agents')
    .insert({ status: 'draft', ...input })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getGtmAgents(): Promise<DbGtmAgent[]> {
  const { data, error } = await getSupabase()
    .from('gtm_agents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getGtmAgent(id: string): Promise<DbGtmAgent | null> {
  const { data, error } = await getSupabase()
    .from('gtm_agents')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

export async function updateGtmAgent(
  id: string,
  updates: Partial<CreateGtmAgentInput>
): Promise<DbGtmAgent> {
  const { data, error } = await getSupabase()
    .from('gtm_agents')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteGtmAgent(id: string): Promise<void> {
  const { error } = await getSupabase().from('gtm_agents').delete().eq('id', id);
  if (error) throw error;
}

export async function touchGtmAgentLastRun(id: string): Promise<void> {
  await getSupabase().from('gtm_agents').update({ last_run_at: new Date().toISOString() }).eq('id', id);
}

// Fills a goal_template's {variable} placeholders with the run's inputs.
export function fillGoalTemplate(template: string, inputs: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = inputs[key];
    return value !== undefined && value !== null ? String(value) : match;
  });
}
