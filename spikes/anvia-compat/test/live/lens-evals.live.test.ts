/**
 * LIVE: real deepseek-v4.1-flash + real MCP + real @anvia/lens exporters. Traces go to a local
 * OTLP receiver (no Lens deployment is configured). Also runs the Eval CLI as a subprocess.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createScoutingAgent } from '../../src/agent.js';
import { ProviderError, toSpikeError } from '../../src/errors.js';
import { withDemoMcp } from '../../src/mcp/client.js';
import { createChatModel, loadModelConfig } from '../../src/model-config.js';
import { createLensClient, lensObservability } from '../../src/observability.js';
import { createScoutingPipeline } from '../../src/pipeline.js';
import { syntheticRequest } from '../fixtures/synthetic-request.js';
import { mcpTestContext } from '../helpers/mcp-test-utils.js';
import { hasAncestor, startOtlpReceiver } from '../helpers/otlp-receiver.js';

const config = loadModelConfig();
const T = 240_000;
const pkgDir = fileURLToPath(new URL('../../', import.meta.url));

async function tracedPipeline(apiKey: string) {
  const rx = await startOtlpReceiver();
  const lens = createLensClient({ baseUrl: rx.baseUrl, publicKey: 'pk-lens-local', secretKey: 'sk-lens-local-secret' }, [config.apiKey, apiKey]);
  const obs = lensObservability(lens);
  const ctx = mcpTestContext();
  const model = createChatModel({ ...config, apiKey });
  const started = performance.now();
  let result: { runId: string; trace?: unknown } | undefined;
  let error: unknown;
  try {
    result = await withDemoMcp(ctx, (mcp) =>
      createScoutingPipeline(createScoutingAgent(model, { mcpServers: mcp.servers, observability: obs.agent }), { observability: obs.pipeline }).run({
        input: { ...syntheticRequest, lookupPlayerIds: ['SYN-101'] },
      }),
    );
  } catch (e) {
    error = e;
  }
  const elapsedMs = Math.round(performance.now() - started);
  await lens.close();
  await rx.close();
  return { result, error, spans: rx.spans(), raw: rx.rawText(), elapsedMs };
}

const summarize = (spans: ReturnType<Awaited<ReturnType<typeof startOtlpReceiver>>['spans']>) =>
  spans.map((s) => ({
    name: s.name,
    spanId: s.spanId,
    parent: s.parentSpanId ?? null,
    status: s.status?.code ?? 0,
    ms: Number((BigInt(s.endTimeUnixNano) - BigInt(s.startTimeUnixNano)) / 1_000_000n),
    tokens: s.attributes['anvia.usage.total_tokens'],
  }));

describe('Lens traces with the real model', () => {
  it('successful Pipeline run: one linked trace containing the MCP tool span', { timeout: T }, async () => {
    const { result, error, spans, raw, elapsedMs } = await tracedPipeline(config.apiKey);
    console.info('[lens-success]', JSON.stringify({ error: error ? String(error) : undefined, trace: result?.trace, elapsedMs, spans: summarize(spans) }));
    expect(error).toBeUndefined();
    const root = spans.find((s) => s.name === 'pipeline.synthetic-scouting-pipeline')!;
    expect(new Set(spans.map((s) => s.traceId))).toEqual(new Set([root.traceId]));
    expect(result!.trace).toMatchObject({ observer: 'lens', traceId: root.traceId });
    const tools = spans.filter((s) => s.name === 'tool.get_demo_player_stats');
    expect(tools.length).toBeGreaterThanOrEqual(1);
    for (const t of tools) expect(hasAncestor(spans, t, root.spanId)).toBe(true);
    expect(spans.some((s) => s.name.startsWith('model.turn.') && s.attributes['anvia.generation.model_id'] === 'deepseek-v4.1-flash')).toBe(true);
    expect(raw).not.toContain(config.apiKey);
  });

  it('failed Pipeline run (provider HTTP 401): linked error trace, key redacted', { timeout: T }, async () => {
    const badKey = 'invalid-key-lens-spike-test';
    const { error, spans, raw } = await tracedPipeline(badKey);
    console.info('[lens-failure]', JSON.stringify({ error: toSpikeError(error, [badKey]).message, spans: summarize(spans) }));
    expect(toSpikeError(error, [badKey])).toBeInstanceOf(ProviderError);
    const root = spans.find((s) => s.name === 'pipeline.synthetic-scouting-pipeline')!;
    expect(root.status?.code).toBe(2);
    expect(root.attributes['anvia.run.status']).toBe('failed');
    const agentRun = spans.find((s) => s.name === 'agent.Synthetic Scouting Agent')!;
    expect(agentRun.status?.code).toBe(2);
    expect(hasAncestor(spans, agentRun, root.spanId)).toBe(true);
    expect(raw).not.toContain(badKey);
    expect(raw).not.toContain(config.apiKey);
  });
});

describe('Eval CLI exit codes with the real model', () => {
  const runCli = (args: string[]) =>
    spawnSync(process.execPath, ['--env-file=../../.env', 'dist/scripts/run-evals.js', ...args], { cwd: pkgDir, encoding: 'utf8', timeout: 220_000 });

  it('exits 0 when all metrics pass', { timeout: T }, () => {
    const r = runCli([]);
    console.info('[eval-pass]', r.status, r.stdout.split('\n').filter((l) => /^(Cases|Metrics|Usage)|  - /.test(l)).join(' | '));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Metrics: 3 total / 3 pass');
  });

  it('exits 1 when an expected value is deliberately wrong', { timeout: T }, () => {
    const r = runCli(['--inject-wrong-expected']);
    console.info('[eval-fail]', r.status, r.stdout.split('\n').filter((l) => /^(Cases|Metrics)|expected 8.65/.test(l)).join(' | '));
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('progressivePassesPer90: expected 8.65, cited 7.65');
  });
});
