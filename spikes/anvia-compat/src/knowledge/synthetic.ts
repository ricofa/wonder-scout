import { chunkKnowledgeDocument, parseKnowledgeDocument, type KnowledgeChunk } from './chunking.js';
import { SYNTHETIC_DOCUMENTS_RAW, SYNTHETIC_KB_VERSION } from './corpus.js';

/** Parses and chunks the fictional corpus in document order. Pure and deterministic. */
export function buildSyntheticChunks(): KnowledgeChunk[] {
  return SYNTHETIC_DOCUMENTS_RAW.flatMap((raw) =>
    chunkKnowledgeDocument(parseKnowledgeDocument(raw), SYNTHETIC_KB_VERSION),
  );
}
