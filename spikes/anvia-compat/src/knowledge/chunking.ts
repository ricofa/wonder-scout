import { createHash } from 'node:crypto';
import { z } from 'zod';

/** Frontmatter required by TDD §6.1, validated at ingestion time (TDD §6.2 step 1). */
const FrontmatterSchema = z.object({
  document_id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'document_id must be lowercase kebab-case'),
  title: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'version must be semver'),
  role_id: z.string().min(1).nullable(),
  seasons: z.array(z.string().min(1)).min(1),
  source_urls: z.array(z.string()),
  reviewed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  usage_rights: z.string().min(1),
  status: z.enum(['active', 'inactive']),
});
export type KnowledgeFrontmatter = z.infer<typeof FrontmatterSchema>;

export type KnowledgeChunk = {
  /** sha256(document_id|version|chunk_number|text_hash), TDD §6.2 step 3. */
  chunkId: string;
  documentId: string;
  documentVersion: string;
  roleId: string | null;
  seasons: string[];
  sourceUrls: string[];
  usageRights: string;
  status: 'active' | 'inactive';
  heading: string;
  chunkNumber: number;
  kbVersion: string;
  content: string;
  textHash: string;
};

export type ParsedKnowledgeDocument = {
  frontmatter: KnowledgeFrontmatter;
  body: string;
};

/** Parses the small YAML subset used by the synthetic corpus (scalars, null, inline lists). */
function parseFrontmatterBlock(block: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const line of block.split('\n')) {
    if (line.trim() === '') continue;
    const colon = line.indexOf(':');
    if (colon <= 0) throw new Error(`Invalid frontmatter line: ${line.slice(0, 40)}`);
    const key = line.slice(0, colon).trim();
    const raw = line.slice(colon + 1).trim();
    if (raw === 'null') out[key] = null;
    else if (raw.startsWith('[') && raw.endsWith(']')) {
      const inner = raw.slice(1, -1).trim();
      out[key] = inner === '' ? [] : inner.split(',').map((item) => item.trim());
    } else out[key] = raw;
  }
  return out;
}

export function parseKnowledgeDocument(raw: string): ParsedKnowledgeDocument {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  if (match === null) throw new Error('Knowledge document must start with a frontmatter block');
  const parsed = FrontmatterSchema.safeParse(parseFrontmatterBlock(match[1] ?? ''));
  if (!parsed.success) {
    // Report field paths only, never raw content.
    throw new Error(`Invalid knowledge frontmatter: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  }
  return { frontmatter: parsed.data, body: match[2] ?? '' };
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Splits a document into one chunk per `##` section. Each chunk keeps its heading.
 * Synthetic sections are short, so one section is one chunk (no token splitting needed here).
 */
export function chunkKnowledgeDocument(doc: ParsedKnowledgeDocument, kbVersion: string): KnowledgeChunk[] {
  const { frontmatter } = doc;
  const sections = doc.body.split(/^## /m).slice(1);
  if (sections.length === 0) throw new Error(`Document ${frontmatter.document_id} has no ## sections`);
  return sections.map((section, index) => {
    const newline = section.indexOf('\n');
    const heading = (newline === -1 ? section : section.slice(0, newline)).trim();
    const content = `## ${heading}\n${(newline === -1 ? '' : section.slice(newline + 1)).trim()}`;
    const textHash = sha256Hex(content);
    const chunkNumber = index + 1;
    const chunkId = sha256Hex(`${frontmatter.document_id}|${frontmatter.version}|${chunkNumber}|${textHash}`);
    return {
      chunkId,
      documentId: frontmatter.document_id,
      documentVersion: frontmatter.version,
      roleId: frontmatter.role_id,
      seasons: frontmatter.seasons,
      sourceUrls: frontmatter.source_urls,
      usageRights: frontmatter.usage_rights,
      status: frontmatter.status,
      heading,
      chunkNumber,
      kbVersion,
      content,
      textHash,
    };
  });
}
