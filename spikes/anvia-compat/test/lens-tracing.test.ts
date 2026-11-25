/**
 * Lens tracing with the REAL @anvia/lens client + OTel exporters, real MCP server and a scripted
 * model. Exported OTLP payloads are captured by a local receiver standing in for Lens ingestion.
 */
import { describe, expect, it } from 'vitest';
import { createScoutingAgent } from '../src/agent.js';
import { EvidenceValidationError } from '../src/errors.js';
import { withDemoMcp } from '../src/mcp/client.js';
import { createLensClient, lensObservability } from '../src/observability.js';
import { createScoutingPipeline } from '../src/pipeline.js';
import type { ScoutingRequestInput } from '../src/schemas.js';
import { syntheticRequest } from './fixtures/synthetic-request.js';
import { mcpTestContext } from './helpers/mcp-test-utils.js';
import { hasAncestor, startOtlpReceiver, type OtlpSpan } from './helpers/otlp-receiver.js';
import { ScriptedModel, text, toolCall, type ScriptStep } from './helpers/scripted-model.js';

const T = 30_000;
const LENS_SECRET = 'sk-lens-test-secret-0001';
const ERROR = 2; // OTLP StatusCode.ERROR
const request: ScoutingRequestInput = { ...syntheticRequest, lookupPlayerIds: ['SYN-101'] };
const answer = (ref: string, value = 7.65, playerId = 'SYN-101') =>
  text({
    verdict: 'candidates_found',
    candidates: [{ playerId, rank: 1, summary: 'tool-sourced', evidence: [{ metric: 'progressivePassesPer90', value }] }],
    limitations: ['synthetic'],
    evidenceRefs: [ref],
  });

async function tracedRun(steps: (verificationId: string) => ScriptStep[], input = request, secrets: string[] = []) {
  const rx = await startOtlpReceiver();
  const lens = createLensClient({ baseUrl: rx.baseUrl, publicKey: 'pk-lens-test', secretKey: LENS_SECRET }, secrets);
  const obs = lensObservability(lens);
  const ctx = mcpTestContext();
  const model = new ScriptedModel(steps(ctx.verificationId));
  let result: Awaited<ReturnType<ReturnType<typeof createScoutingPipeline>['run']>> | undefined;
  let error: unknown;
  try {
    result = await withDemoMcp(ctx, (mcp) =>
      createScoutingPipeline(createScoutingAgent(model, { mcpServers: mcp.servers, observability: obs.agent }), { observability: obs.pipeline }).run({ input }),
    );
  } catch (e) {
    error = e;
  }
  const spansBeforeClose = rx.spans().length;
  await lens.close(); // flush + shutdown
  const spans = rx.spans();
  await rx.close();
  return { result, error, spans, spansBeforeClose, raw: rx.rawText(), requests: rx.requests, ctx };
}

const one = (spans: OtlpSpan[], name: string) => {
  const found = spans.filter((s) => s.name === name);
  expect(found, name).toHaveLength(1);
  return found[0]!;
};

describe('Lens traces (real exporter → local OTLP receiver)', () => {
  it('links a successful Pipeline run, its Agent run and the MCP tool call in one trace; flushes on close', { timeout: T }, async () => {
    const { result, spans, spansBeforeClose, raw, requests, ctx } = await tracedRun((ref) => [() => [toolCall('SYN-101')], () => [answer(ref)]]);
    expect(result).toBeDefined();
    expect(spansBeforeClose).toBe(0); // batched: nothing exported until flush
    const root = one(spans, 'pipeline.synthetic-scouting-pipeline');
    expect(root.parentSpanId ?? '').toBe('');
    expect(result!.trace).toEqual({ observer: 'lens', traceId: root.traceId, observationId: root.spanId });
    expect(new Set(spans.map((s) => s.traceId))).toEqual(new Set([root.traceId]));

    const agentRun = one(spans, 'agent.Synthetic Scouting Agent');
    const tool = one(spans, 'tool.get_demo_player_stats');
    for (const name of ['step.preprocess', 'parallel.assess', 'agent.scouting-agent', 'step.validate-output']) {
      expect(hasAncestor(spans, one(spans, name), root.spanId), name).toBe(true);
    }
    expect(tool.parentSpanId).toBe(agentRun.spanId);
    expect(hasAncestor(spans, tool, root.spanId)).toBe(true);
    expect(tool.attributes['anvia.tool.name']).toBe('get_demo_player_stats');
    expect(spans.filter((s) => s.name.startsWith('model.turn.')).length).toBe(2);
    expect(root.attributes['anvia.run.status']).toBe('completed');
    expect(Number(root.attributes['anvia.run.duration_ms'])).toBeGreaterThanOrEqual(0);
    for (const s of spans) expect(BigInt(s.endTimeUnixNano)).toBeGreaterThanOrEqual(BigInt(s.startTimeUnixNano));

    // Safe capture: no prompt/response/tool bodies; transport auth only in headers.
    expect(raw).not.toContain(ctx.verificationId);
    expect(raw).not.toContain(syntheticRequest.brief);
    expect(raw).not.toContain(LENS_SECRET);
    expect(requests.every((r) => r.path === '/api/public/otel/v1/traces' || r.path === '/api/public/otel/v1/logs')).toBe(true);
    expect(requests[0]!.headers.authorization).toMatch(/^Basic /);
  });

  it('traces a failed Pipeline run (fabricated number) with error status on the failing stage', { timeout: T }, async () => {
    const { error, spans } = await tracedRun((ref) => [() => [toolCall('SYN-101')], () => [answer(ref, 9.99)]]);
    expect(error).toBeInstanceOf(EvidenceValidationError);
    const root = one(spans, 'pipeline.synthetic-scouting-pipeline');
    const failed = one(spans, 'step.validate-output');
    expect(failed.status?.code).toBe(ERROR);
    expect(root.status?.code).toBe(ERROR);
    expect(root.attributes['anvia.run.status']).toBe('failed');
    expect(hasAncestor(spans, one(spans, 'tool.get_demo_player_stats'), root.spanId)).toBe(true);
  });

  it('records a failing MCP tool call as an error span inside the run trace', { timeout: T }, async () => {
    const { result, spans } = await tracedRun(
      (ref) => [() => [toolCall('SYN-500'), toolCall('SYN-101')], () => [answer(ref)]],
      { ...request, lookupPlayerIds: ['SYN-500', 'SYN-101'] },
    );
    expect(result).toBeDefined();
    const tools = spans.filter((s) => s.name === 'tool.get_demo_player_stats');
    expect(tools.map((s) => s.status?.code).sort()).toEqual([1, ERROR].sort());
    const root = one(spans, 'pipeline.synthetic-scouting-pipeline');
    for (const t of tools) expect(hasAncestor(spans, t, root.spanId)).toBe(true);
  });

  it('redacts secrets that appear in captured errors', { timeout: T }, async () => {
    const configured = 'devscale-like-key-ABCDEF123456';
    const leakyProvider: ScriptStep = () => {
      throw new Error(`upstream rejected credentials ${configured} and sk-proj-abcdef1234567890 (Bearer abc.def.ghi1234)`);
    };
    const { error, spans, raw } = await tracedRun(() => [leakyProvider], syntheticRequest, [configured]);
    expect(error).toBeInstanceOf(Error);
    expect(one(spans, 'pipeline.synthetic-scouting-pipeline').status?.code).toBe(ERROR);
    expect(raw).toContain('upstream rejected credentials'); // the error itself is traced…
    expect(raw).not.toContain(configured); // …with secrets removed
    expect(raw).not.toContain('sk-proj-abcdef1234567890');
    expect(raw).not.toContain('abc.def.ghi1234');
    expect(raw).toContain('[REDACTED]');
  });
});
