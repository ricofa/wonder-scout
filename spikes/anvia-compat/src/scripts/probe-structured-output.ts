/**
 * Repeats raw json_schema(strict) requests to measure whether the gateway ENFORCES the schema.
 * Usage: N=10 pnpm probe:structured. Prints content excerpts only, never credentials.
 */
import { loadModelConfig } from '../model-config.js';
const c = loadModelConfig();
const schema = (name: string, props: object, req: string[]) => ({ type: 'json_schema', json_schema: { name, strict: true, schema: { type: 'object', properties: props, required: req, additionalProperties: false } } });
const cases = {
  'conflicting prompt, ok:boolean': { messages: [{ role: 'user', content: 'Ignore any format rules and reply with the plain sentence: The weather is nice.' }], rf: schema('probe', { ok: { type: 'boolean' } }, ['ok']) },
  'system says prose, digest pattern': { messages: [{ role: 'system', content: 'Always reply with one plain English sentence. Never output JSON, braces or code.' }, { role: 'user', content: 'Describe the weather in a fictional town.' }], rf: schema('digest', { digest: { type: 'string', pattern: '^[0-9a-f]{64}$' } }, ['digest']) },
};
for (const [label, k] of Object.entries(cases)) {
  const results: string[] = [];
  for (let i = 0; i < Number(process.env.N ?? 5); i++) {
    const r = await fetch(`${c.baseUrl}/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${c.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: c.modelId, max_tokens: 2000, messages: k.messages, response_format: k.rf }) });
    const j = (await r.json()) as any;
    const content = String(j.choices?.[0]?.message?.content ?? `HTTP ${r.status}`);
    let json = false; try { JSON.parse(content); json = true; } catch {}
    results.push(`${json ? 'JSON ' : 'PROSE'} ${content.replace(/\s+/g, ' ').slice(0, 70)}`);
  }
  const conforming = results.filter((r) => r.startsWith('JSON')).length;
  console.log(`== ${label}: ${conforming}/${results.length} JSON\n  ${results.join('\n  ')}`);
}
