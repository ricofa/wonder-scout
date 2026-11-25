/**
 * LIVE tests: real all-MiniLM-L6-v2 embeddings and a real local Qdrant. No mocks.
 * Requires QDRANT_URL / QDRANT_API_KEY in the repo-root .env and a running infra/qdrant stack.
 * Uses a dedicated collection that is dropped and recreated at the start of the run.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadTransformersEmbeddingModel, type LoadedTransformersEmbeddingModel } from '@anvia/transformers';
import { QdrantVectorClient, type QdrantVectorStore } from '@anvia/qdrant';
import {
  EMBEDDING_CONFIG,
  SPIKE_COLLECTION,
  countPoints,
  createKnowledgeStore,
  ingestChunks,
  roleFilter,
  type KnowledgeMetadata,
} from '../../src/knowledge/store.js';
import { buildSyntheticChunks } from '../../src/knowledge/synthetic.js';

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY ?? '';
const EXPECTED_POINTS = 12;

/** Expected top-1 document for each fixed query, chosen before the run. */
const EXPECTED_TOP1: ReadonlyArray<{ query: string; documentId: string }> = [
  { query: 'which midfielder moves the ball forward through the middle and beyond the defensive line', documentId: 'progressive-midfielder' },
  { query: 'how many minutes must a player have before the evidence is considered reliable', documentId: 'evidence-confidence-rules' },
  { query: 'how is a per 90 minutes value calculated', documentId: 'metric-glossary' },
  { query: 'a wide forward who cuts inside to shoot with the stronger foot', documentId: 'inside-forward' },
];

async function dropCollection(): Promise<void> {
  // The adapter has no drop method; use the REST API directly for test reset only.
  const res = await fetch(`${QDRANT_URL}/collections/${SPIKE_COLLECTION}`, {
    method: 'DELETE',
    headers: { 'api-key': QDRANT_API_KEY },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Collection reset failed with HTTP ${res.status}`);
}

describe('knowledge retrieval (live: real embeddings + real Qdrant)', () => {
  let embedder: LoadedTransformersEmbeddingModel;
  let client: QdrantVectorClient;
  let store: QdrantVectorStore<string, KnowledgeMetadata>;
  const latency: Record<string, number> = {};

  beforeAll(async () => {
    const t0 = performance.now();
    embedder = await loadTransformersEmbeddingModel({
      modelId: EMBEDDING_CONFIG.modelId,
      pooling: EMBEDDING_CONFIG.pooling,
      normalize: EMBEDDING_CONFIG.normalize,
    });
    latency.modelInitMs = Math.round(performance.now() - t0);
    client = new QdrantVectorClient({ url: QDRANT_URL, apiKey: QDRANT_API_KEY });
    await dropCollection();
    store = createKnowledgeStore(client);
    await store.ensure();
  }, 600_000);

  afterAll(async () => {
    await client?.close();
    await embedder?.close();
    process.stderr.write(`KNOWLEDGE_LATENCY ${JSON.stringify(latency)}\n`);
  });

  it('produces 384-dimensional, unit-length embeddings from the real model', async () => {
    const [a] = await embedder.embedTexts(['Progressive midfielders advance the ball.']);
    expect(a?.vector).toHaveLength(EMBEDDING_CONFIG.dimensions);
    const norm = Math.sqrt((a?.vector ?? []).reduce((s, x) => s + x * x, 0));
    expect(norm).toBeGreaterThan(0.999);
    expect(norm).toBeLessThan(1.001);
  });

  it('ingests the synthetic corpus into a dedicated collection with the expected point count', async () => {
    const report = await ingestChunks(buildSyntheticChunks(), embedder, store);
    latency.ingestEmbedMs = report.embedMs;
    latency.ingestUpsertMs = report.upsertMs;
    expect(report.chunks).toBe(EXPECTED_POINTS);
    expect(await countPoints(store)).toBe(EXPECTED_POINTS);
  });

  it('re-ingesting unchanged content is idempotent (no duplicate points)', async () => {
    await ingestChunks(buildSyntheticChunks(), embedder, store);
    await ingestChunks(buildSyntheticChunks(), embedder, store);
    expect(await countPoints(store)).toBe(EXPECTED_POINTS);
  });

  it.each(EXPECTED_TOP1)('returns the expected document in the top 3 for: $query', async ({ query, documentId }) => {
    const [q] = await embedder.embedTexts([query]);
    const hits = await store.search({ vector: q?.vector ?? [], topK: 3 });
    expect(hits).toHaveLength(3);
    expect(hits[0]?.metadata?.documentId).toBe(documentId);
    expect(hits.map((h) => h.metadata?.documentId)).toContain(documentId);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
    }
  });

  it('applies an eq metadata filter on roleId and preserves metadata in results', async () => {
    const [q] = await embedder.embedTexts(['shots and dribbles from wide positions']);
    const hits = await store.search({ vector: q?.vector ?? [], topK: 10, filter: roleFilter('inside-forward') });
    expect(hits).toHaveLength(3);
    for (const hit of hits) {
      expect(hit.metadata?.roleId).toBe('inside-forward');
      expect(hit.metadata?.documentVersion).toBe('1.0.0');
      expect(hit.metadata?.usageRights).toBe('internal-synthetic-spike');
      expect(typeof hit.metadata?.heading).toBe('string');
      expect(hit.document).toContain('## ');
    }
  });

  it('measures search latency over repeated queries', async () => {
    const [q] = await embedder.embedTexts(['minimum sample for confidence']);
    const vector = q?.vector ?? [];
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t = performance.now();
      await store.search({ vector, topK: 5 });
      samples.push(performance.now() - t);
    }
    samples.sort((x, y) => x - y);
    latency.searchP50Ms = Math.round(samples[Math.floor(samples.length / 2)] ?? 0);
    latency.searchMaxMs = Math.round(samples[samples.length - 1] ?? 0);
    expect(latency.searchP50Ms).toBeLessThan(1000);
  });

  it('rejects an upsert whose vector dimension does not match the collection', async () => {
    await expect(
      store.upsert({
        documents: [
          {
            id: 'dimension-probe',
            document: 'wrong size',
            metadata: { documentId: 'probe', documentVersion: '0.0.0', roleId: '', seasons: '', sourceUrls: '', usageRights: '', status: 'active', heading: '', chunkNumber: 0, kbVersion: '' },
            embeddings: [{ document: 'wrong size', vector: new Array<number>(10).fill(0.1) }],
          },
        ],
      }),
    ).rejects.toThrow(/dimension/i);
    expect(await countPoints(store)).toBe(EXPECTED_POINTS);
  });

  it('rejects a query vector of the wrong dimension', async () => {
    await expect(store.search({ vector: new Array<number>(10).fill(0.1), topK: 3 })).rejects.toThrow(/dimension mismatch for query/i);
  });
});
