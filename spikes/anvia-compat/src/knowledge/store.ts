import type { EmbeddingModel } from '@anvia/core/embeddings';
import type { VectorFilter, VectorSearchResult } from '@anvia/core/vector-store';
import { QdrantVectorClient, type QdrantVectorStore } from '@anvia/qdrant';
import type { KnowledgeChunk } from './chunking.js';

/** Dedicated spike collection. Deliberately NOT the TDD production name `wonderscout_knowledge_v1`. */
export const SPIKE_COLLECTION = 'wonderscout_spike_knowledge_v1';

/** Recorded embedding contract: all-MiniLM-L6-v2 produces 384-dim, mean-pooled, L2-normalized vectors. */
export const EMBEDDING_CONFIG = {
  provider: 'transformers',
  modelId: 'Xenova/all-MiniLM-L6-v2',
  dimensions: 384,
  pooling: 'mean',
  normalize: true,
  metric: 'cosine',
} as const;

export type KnowledgeMetadata = {
  documentId: string;
  documentVersion: string;
  roleId: string;
  seasons: string;
  sourceUrls: string;
  usageRights: string;
  status: string;
  heading: string;
  chunkNumber: number;
  kbVersion: string;
  [key: string]: string | number | boolean | null;
};

export type KnowledgeHit = VectorSearchResult<string, KnowledgeMetadata>;

/** Thrown for any embedding whose length differs from the collection's configured dimensions. */
export class DimensionMismatchError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
    readonly subject: string,
  ) {
    super(`Embedding dimension mismatch for ${subject}: expected ${expected}, got ${actual}`);
    this.name = 'DimensionMismatchError';
  }
}

export function assertDimensions(vector: readonly number[], expected: number, subject: string): void {
  if (vector.length !== expected) throw new DimensionMismatchError(expected, vector.length, subject);
}

export function createKnowledgeStore(
  client: QdrantVectorClient,
  options: { collectionName?: string; dimensions?: number } = {},
): QdrantVectorStore<string, KnowledgeMetadata> {
  return client.vectorStore<string, KnowledgeMetadata>({
    collectionName: options.collectionName ?? SPIKE_COLLECTION,
    dimensions: options.dimensions ?? EMBEDDING_CONFIG.dimensions,
    metric: 'cosine',
  });
}

export type IngestReport = {
  chunks: number;
  embedMs: number;
  upsertMs: number;
};

/**
 * Embeds and upserts chunks. Point IDs come from the deterministic chunk ID, so repeated
 * ingestion of unchanged content overwrites the same points and does not add duplicates.
 */
export async function ingestChunks(
  chunks: readonly KnowledgeChunk[],
  embedder: EmbeddingModel,
  store: QdrantVectorStore<string, KnowledgeMetadata>,
  dimensions: number = EMBEDDING_CONFIG.dimensions,
): Promise<IngestReport> {
  const embedStart = performance.now();
  const embeddings = await embedder.embedTexts(chunks.map((c) => c.content));
  const embedMs = Math.round(performance.now() - embedStart);
  if (embeddings.length !== chunks.length) {
    throw new Error(`Embedder returned ${embeddings.length} vectors for ${chunks.length} chunks`);
  }

  const documents = chunks.map((chunk, i) => {
    const embedding = embeddings[i];
    if (embedding === undefined) throw new Error(`Missing embedding for chunk ${chunk.chunkId}`);
    assertDimensions(embedding.vector, dimensions, `chunk ${chunk.documentId}#${chunk.chunkNumber}`);
    return {
      id: chunk.chunkId,
      document: chunk.content,
      metadata: {
        documentId: chunk.documentId,
        documentVersion: chunk.documentVersion,
        roleId: chunk.roleId ?? '',
        seasons: chunk.seasons.join(','),
        sourceUrls: chunk.sourceUrls.join(','),
        usageRights: chunk.usageRights,
        status: chunk.status,
        heading: chunk.heading,
        chunkNumber: chunk.chunkNumber,
        kbVersion: chunk.kbVersion,
      },
      embeddings: [embedding],
    };
  });

  const upsertStart = performance.now();
  await store.upsert({ documents });
  return { chunks: documents.length, embedMs, upsertMs: Math.round(performance.now() - upsertStart) };
}

/** Counts stored points by paging through inspect(). */
export async function countPoints(store: QdrantVectorStore<string, KnowledgeMetadata>): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  do {
    const page = await store.inspect({ limit: 100, ...(cursor === undefined ? {} : { cursor }) });
    total += page.items.length;
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return total;
}

export function roleFilter(roleId: string): VectorFilter {
  return { type: 'eq', key: 'roleId', value: roleId };
}
