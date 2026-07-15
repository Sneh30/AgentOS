import { HydraDBClient } from '@hydradb/sdk';
import type { DbTask } from '@/types/database';

export interface HydraMemory {
  id?: string;
  text: string;
  title?: string;
  infer?: boolean;
  source_id?: string;
  status?: 'queued' | 'processing' | 'completed' | 'errored';
}

export interface HydraRecallResult {
  chunkUuid?: string;
  id?: string;
  chunkContent?: string;
  sourceType?: string;
  sourceUploadTime?: string;
  sourceTitle?: string;
  relevancyScore?: number;
}

export interface HydraSearchResult {
  chunks: HydraRecallResult[];
  sources: Array<{
    id?: string;
    title?: string;
    type?: string;
    description?: string;
  }>;
  graphContext?: {
    queryPaths?: Array<{
      triplets?: Array<{
        source?: Record<string, unknown>;
        relation?: Record<string, unknown>;
        target?: Record<string, unknown>;
      }>;
      relevancyScore?: number;
    }>;
    chunkRelations?: unknown[];
  };
}

export interface HydraKnowledge {
  id: string;
  title: string;
  source: string;
  description?: string;
  url?: string;
  content?: string;
  timestamp?: string;
}

export interface ProcessingStatus {
  file_id: string;
  indexing_status: 'queued' | 'processing' | 'completed' | 'errored' | 'graph_creation' | 'failed';
  success: boolean;
  message: string;
}

const HYDRA_API_KEY = process.env.HYDRA_DB_API_KEY;
const HYDRA_DATABASE = process.env.HYDRA_DB_DATABASE || 'anymind';
const DEFAULT_COLLECTION = process.env.HYDRA_DB_COLLECTION || 'anymind';

function getCollection(userId?: string): string {
  return userId || DEFAULT_COLLECTION;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

let client: HydraDBClient | null = null;
function getClient(): HydraDBClient {
  if (!HYDRA_API_KEY) {
    throw new Error('HydraDB not configured');
  }
  if (!client) {
    client = new HydraDBClient({ token: HYDRA_API_KEY });
  }
  return client;
}

// Databases (v2's replacement for tenants) must exist before use — create it lazily once per process.
// If it already exists this just errors harmlessly and we move on; real failures surface on the actual call.
let databaseEnsured = false;
async function ensureDatabase(): Promise<void> {
  if (databaseEnsured) return;
  databaseEnsured = true;
  try {
    await getClient().databases.create({ database: HYDRA_DATABASE });
  } catch {
    // likely already exists
  }
}

export function isHydraConfigured(): boolean {
  return !!(HYDRA_API_KEY && HYDRA_DATABASE);
}

export async function storeMemory(
  text: string,
  options?: {
    title?: string;
    infer?: boolean;
    userId?: string;
    taskId?: string;
  }
): Promise<{ success: boolean; source_id?: string; error?: string }> {
  if (!isHydraConfigured()) {
    console.warn('[HydraDB] Not configured, skipping memory store');
    return { success: false, error: 'HydraDB not configured' };
  }

  const id = generateId(options?.taskId ? `task_${options.taskId}` : options?.userId ? `user_${options.userId}` : 'mem');

  try {
    await ensureDatabase();
    const response = await getClient().context.ingest({
      tenantId: HYDRA_DATABASE,
      subTenantId: getCollection(options?.userId),
      type: 'memory',
      memories: JSON.stringify([
        {
          id,
          text,
          infer: options?.infer ?? true,
          title: options?.title || 'Memory from Anymind',
        },
      ]),
      upsert: 'true',
    });

    const failed = (response.data?.failedCount ?? 0) > 0;
    return {
      success: !failed,
      source_id: response.data?.results?.[0]?.id || id,
      error: failed ? response.data?.results?.[0]?.error : undefined,
    };
  } catch (error) {
    console.error('[HydraDB] Store error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function recallMemories(
  query: string,
  options?: {
    maxResults?: number;
    alpha?: number;
    recencyBias?: number;
    userId?: string;
  }
): Promise<HydraSearchResult | null> {
  if (!isHydraConfigured()) {
    console.warn('[HydraDB] Not configured, skipping memory recall');
    return null;
  }

  try {
    await ensureDatabase();
    const response = await getClient().query({
      database: HYDRA_DATABASE,
      collection: getCollection(options?.userId),
      query,
      type: 'memory',
      queryBy: 'hybrid',
      mode: 'fast',
      maxResults: options?.maxResults || 10,
      alpha: options?.alpha ?? 0.8,
      recencyBias: options?.recencyBias ?? 0.1,
      graphContext: true,
    });

    return (response.data as HydraSearchResult) ?? { chunks: [], sources: [] };
  } catch (error) {
    console.error('[HydraDB] Recall error:', error);
    return null;
  }
}

export async function verifyProcessing(sourceIds: string[], userId?: string): Promise<ProcessingStatus[]> {
  if (!isHydraConfigured()) {
    return [];
  }

  try {
    await ensureDatabase();
    const response = await getClient().context.status({
      tenantId: HYDRA_DATABASE,
      subTenantId: getCollection(userId),
      ids: sourceIds,
    });

    const statuses = response.data?.statuses || [];
    return statuses.map((s) => ({
      file_id: s.id || '',
      indexing_status: (s.indexingStatus as ProcessingStatus['indexing_status']) || 'queued',
      success: s.success ?? !['errored', 'failed'].includes(s.indexingStatus || ''),
      message: s.errorMessage ?? s.message ?? '',
    }));
  } catch (error) {
    console.error('[HydraDB] Verify processing error:', error);
    return [];
  }
}

export async function listMemories(options?: {
  limit?: number;
  offset?: number;
  userId?: string;
}): Promise<{ sources: Array<{ id: string; title: string; type: string; timestamp: string }>; total: number } | null> {
  if (!isHydraConfigured()) {
    return null;
  }

  try {
    await ensureDatabase();
    const pageSize = options?.limit || 50;
    const page = options?.offset ? Math.floor(options.offset / pageSize) + 1 : 1;

    const response = await getClient().context.list({
      database: HYDRA_DATABASE,
      collection: getCollection(options?.userId),
      type: 'memory',
      page,
      pageSize,
    });

    const inner = response.data?.inner;
    const sources = (inner?.sources || []) as Array<Record<string, unknown>>;
    return {
      sources: sources.map((s) => ({
        id: (s.id as string) || '',
        title: (s.title as string) || '',
        type: (s.type as string) || '',
        timestamp: (s.timestamp as string) || '',
      })),
      total: inner?.total ?? sources.length,
    };
  } catch (error) {
    console.error('[HydraDB] List error:', error);
    return null;
  }
}

export async function deleteMemory(sourceId: string, userId?: string): Promise<boolean> {
  if (!isHydraConfigured()) {
    return false;
  }

  try {
    await ensureDatabase();
    await getClient().context.delete({
      type: 'memory',
      database: HYDRA_DATABASE,
      collection: getCollection(userId),
      ids: [sourceId],
    });
    return true;
  } catch (error) {
    console.error('[HydraDB] Delete error:', error);
    return false;
  }
}

export function formatMemoryContext(recallResult: HydraSearchResult | null): string {
  if (!recallResult || recallResult.chunks.length === 0) {
    return '';
  }

  const contextParts: string[] = [];

  contextParts.push('## Relevant Context from Memory:\n');

  for (const chunk of recallResult.chunks) {
    if (chunk.chunkContent) {
      contextParts.push(`- ${chunk.chunkContent}`);
    }
  }

  if (recallResult.graphContext?.queryPaths?.length) {
    contextParts.push('\n## Related Knowledge:\n');
    for (const path of recallResult.graphContext.queryPaths.slice(0, 3)) {
      for (const triplet of path.triplets || []) {
        const source = triplet.source as { name?: string } | undefined;
        const relation = triplet.relation as { canonical_predicate?: string; canonicalPredicate?: string } | undefined;
        const target = triplet.target as { name?: string } | undefined;
        const predicate = relation?.canonicalPredicate || relation?.canonical_predicate;
        if (source?.name && predicate && target?.name) {
          contextParts.push(`- ${source.name} ${predicate} ${target.name}`);
        }
      }
    }
  }

  return contextParts.join('\n');
}

export async function storeTaskMemory(
  task: DbTask,
  context?: string
): Promise<void> {
  const contentParts: string[] = [];

  contentParts.push(`User Input: ${task.input}`);

  if (task.title) {
    contentParts.push(`Task: ${task.title}`);
  }

  if (task.result) {
    contentParts.push(`Result: ${JSON.stringify(task.result)}`);
  }

  if (task.error) {
    contentParts.push(`Error: ${task.error}`);
  }

  if (context) {
    contentParts.push(`Context: ${context}`);
  }

  const fullText = contentParts.join('\n');

  await storeMemory(fullText, {
    title: task.title || `Task: ${task.input.substring(0, 50)}...`,
    infer: true,
    taskId: task.id,
  });
}

export async function getContextForTask(
  userInput: string,
  userId: string
): Promise<{ context: string; memories: HydraSearchResult | null }> {
  const searchResult = await recallMemories(userInput, {
    maxResults: 5,
    alpha: 0.7,
    recencyBias: 0.2,
    userId,
  });

  const context = formatMemoryContext(searchResult);

  return { context, memories: searchResult };
}

export async function storeKnowledge(
  knowledge: {
    id: string;
    title: string;
    source: string;
    description?: string;
    url?: string;
    content?: string;
    timestamp?: string;
    metadata?: Record<string, unknown>;
    userId?: string;
  }
): Promise<{ success: boolean; source_id?: string; error?: string }> {
  if (!isHydraConfigured()) {
    console.warn('[HydraDB] Not configured, skipping knowledge store');
    return { success: false, error: 'HydraDB not configured' };
  }

  try {
    await ensureDatabase();
    const response = await getClient().context.ingest({
      tenantId: HYDRA_DATABASE,
      subTenantId: getCollection(knowledge.userId),
      type: 'knowledge',
      appKnowledge: JSON.stringify([
        {
          id: knowledge.id,
          title: knowledge.title,
          type: knowledge.source,
          content: { text: knowledge.content || '' },
          additionalMetadata: {
            url: knowledge.url || '',
            description: knowledge.description || '',
            timestamp: knowledge.timestamp || new Date().toISOString(),
            ...(knowledge.metadata || {}),
          },
        },
      ]),
      upsert: 'true',
    });

    const failed = (response.data?.failedCount ?? 0) > 0;
    return {
      success: !failed,
      source_id: response.data?.results?.[0]?.id || knowledge.id,
      error: failed ? response.data?.results?.[0]?.error : undefined,
    };
  } catch (error) {
    console.error('[HydraDB] Store knowledge error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function recallKnowledge(
  query: string,
  options?: {
    maxResults?: number;
    alpha?: number;
    userId?: string;
  }
): Promise<HydraSearchResult | null> {
  if (!isHydraConfigured()) {
    console.warn('[HydraDB] Not configured, skipping knowledge recall');
    return null;
  }

  try {
    await ensureDatabase();
    const response = await getClient().query({
      database: HYDRA_DATABASE,
      collection: getCollection(options?.userId),
      query,
      type: 'knowledge',
      queryBy: 'hybrid',
      mode: 'fast',
      maxResults: options?.maxResults || 10,
      alpha: options?.alpha ?? 0.5,
      graphContext: true,
    });

    return (response.data as HydraSearchResult) ?? { chunks: [], sources: [] };
  } catch (error) {
    console.error('[HydraDB] Knowledge recall error:', error);
    return null;
  }
}

export function formatKnowledgeContext(recallResult: HydraSearchResult | null): string {
  if (!recallResult || recallResult.chunks.length === 0) {
    return '';
  }

  const contextParts: string[] = [];

  contextParts.push('## Relevant Knowledge from Web Sources:\n');

  const seenSources = new Set<string>();
  for (const chunk of recallResult.chunks) {
    if (chunk.sourceTitle && chunk.id && !seenSources.has(chunk.id)) {
      seenSources.add(chunk.id);
      contextParts.push(`\n### ${chunk.sourceTitle}`);
      if (chunk.chunkContent) {
        contextParts.push(`\n${chunk.chunkContent.substring(0, 800)}${chunk.chunkContent.length > 800 ? '...' : ''}`);
      }
    }
  }

  return contextParts.join('\n');
}

export async function getContextForTaskWithKnowledge(
  userInput: string,
  userId: string
): Promise<{ memoryContext: string; knowledgeContext: string }> {
  const [memoryResult, knowledgeResult] = await Promise.all([
    recallMemories(userInput, { maxResults: 3, alpha: 0.7, recencyBias: 0.2, userId }),
    recallKnowledge(userInput, { maxResults: 5, alpha: 0.5, userId }),
  ]);

  const memoryContext = formatMemoryContext(memoryResult);
  const knowledgeContext = formatKnowledgeContext(knowledgeResult);

  return { memoryContext, knowledgeContext };
}
