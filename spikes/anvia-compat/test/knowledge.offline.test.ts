import { describe, expect, it } from 'vitest';
import { QdrantVectorClient } from '@anvia/qdrant';
import { chunkKnowledgeDocument, parseKnowledgeDocument } from '../src/knowledge/chunking.js';
import { SYNTHETIC_DOCUMENTS_RAW, SYNTHETIC_KB_VERSION } from '../src/knowledge/corpus.js';
import { buildSyntheticChunks } from '../src/knowledge/synthetic.js';
import { DimensionMismatchError, assertDimensions, roleFilter } from '../src/knowledge/store.js';

describe('knowledge parsing and chunking (offline)', () => {
  it('parses all synthetic documents with required frontmatter', () => {
    const ids = SYNTHETIC_DOCUMENTS_RAW.map((raw) => parseKnowledgeDocument(raw).frontmatter.document_id);
    expect(ids).toEqual(['progressive-midfielder', 'inside-forward', 'evidence-confidence-rules', 'metric-glossary']);
  });

  it('produces the expected chunk count and document IDs', () => {
    const chunks = buildSyntheticChunks();
    expect(chunks).toHaveLength(12);
    const perDoc = new Map<string, number>();
    for (const c of chunks) perDoc.set(c.documentId, (perDoc.get(c.documentId) ?? 0) + 1);
    expect([...perDoc.entries()]).toEqual([
      ['progressive-midfielder', 3],
      ['inside-forward', 3],
      ['evidence-confidence-rules', 3],
      ['metric-glossary', 3],
    ]);
  });

  it('keeps role, version and source metadata on every chunk', () => {
    const chunks = buildSyntheticChunks();
    for (const c of chunks) {
      expect(c.documentVersion).toBe('1.0.0');
      expect(c.kbVersion).toBe(SYNTHETIC_KB_VERSION);
      expect(c.usageRights).toBe('internal-synthetic-spike');
    }
    expect(chunks.find((c) => c.documentId === 'inside-forward')?.roleId).toBe('inside-forward');
    expect(chunks.find((c) => c.documentId === 'metric-glossary')?.roleId).toBeNull();
  });

  it('derives deterministic chunk IDs that change when content changes', () => {
    const first = buildSyntheticChunks().map((c) => c.chunkId);
    const second = buildSyntheticChunks().map((c) => c.chunkId);
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(first.length);

    const raw = SYNTHETIC_DOCUMENTS_RAW[0] ?? '';
    const edited = raw.replace('Do not rank a player on progression alone', 'Rank a player on progression alone');
    const original = chunkKnowledgeDocument(parseKnowledgeDocument(raw), SYNTHETIC_KB_VERSION);
    const changed = chunkKnowledgeDocument(parseKnowledgeDocument(edited), SYNTHETIC_KB_VERSION);
    expect(changed.at(-1)?.chunkId).not.toBe(original.at(-1)?.chunkId);
    expect(changed[0]?.chunkId).toBe(original[0]?.chunkId);
  });

  it('rejects frontmatter that is missing required fields, without echoing content', () => {
    const bad = '---\ndocument_id: Bad Id\ntitle: x\n---\n\n## s\ntext\n';
    expect(() => parseKnowledgeDocument(bad)).toThrow(/Invalid knowledge frontmatter/);
    expect(() => parseKnowledgeDocument('# no frontmatter')).toThrow(/frontmatter block/);
  });
});

describe('dimension and filter guards (offline)', () => {
  it('rejects a vector whose length differs from the configured dimensions', () => {
    expect(() => assertDimensions(new Array<number>(10).fill(0), 384, 'query')).toThrow(DimensionMismatchError);
    expect(() => assertDimensions(new Array<number>(384).fill(0), 384, 'query')).not.toThrow();
  });

  it('builds an eq filter on roleId', () => {
    expect(roleFilter('inside-forward')).toEqual({ type: 'eq', key: 'roleId', value: 'inside-forward' });
  });
});

describe('Qdrant connection failure (offline, no server needed)', () => {
  it('fails with a connection error when the port is closed', async () => {
    const client = new QdrantVectorClient({ url: 'http://127.0.0.1:1', apiKey: 'unused-test-key' });
    const store = client.vectorStore({ collectionName: 'wonderscout_connection_probe', dimensions: 384 });
    await expect(store.validate()).rejects.toThrow();
    await client.close();
  });
});
