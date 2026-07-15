import { createAndExecuteTask, type ExecuteTaskOutput } from '../executor-enhanced';
import { getGtmAgent, fillGoalTemplate, touchGtmAgentLastRun } from './definitions';

export async function runGtmAgent(
  agentId: string,
  internalUserId: string,
  inputs: Record<string, unknown> = {}
): Promise<ExecuteTaskOutput | { error: string }> {
  const agent = await getGtmAgent(agentId);
  if (!agent) return { error: 'Agent not found' };
  if (agent.status !== 'active' && agent.status !== 'draft') {
    return { error: `Agent is ${agent.status}, cannot run` };
  }

  const goal = fillGoalTemplate(agent.goal_template, inputs);
  const result = await createAndExecuteTask(goal, internalUserId, agentId);
  await touchGtmAgentLastRun(agentId);
  return result;
}
