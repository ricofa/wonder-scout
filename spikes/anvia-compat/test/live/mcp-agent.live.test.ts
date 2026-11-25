/**
 * LIVE: the real Devscale model calls the real stdio MCP tool through Anvia. No mocks.
 * Success requires recorded invocation evidence (server log + run messages), not model text.
 */
import { describe, expect, it } from 'vitest';
import { buildToolLookupPrompt, createScoutingAgent } from '../../src/agent.js';
import { toSpikeError } from '../../src/errors.js';
import { withDemoMcp } from '../../src/mcp/client.js';
import { assertToolEvidence, extractToolInvocations } from '../../src/mcp/evidence.js';
import { createChatModel, loadModelConfig } from '../../src/model-config.js';
import { runAgentWithLimits, RunTimeoutError, ToolCallLimitExceededError } from '../../src/runtime.js';
import { mcpTestContext, readInvocationLog } from '../helpers/mcp-test-utils.js';

const config = loadModelConfig();
const model = createChatModel(config);
const T = 240_000;
const calls = (path: string) => readInvocationLog(path).filter((e) => e.event === 'call');

describe('real Agent tool calling via MCP (deepseek-v4.1-flash)', () => {
  it('invokes the MCP tool and consumes the genuine result', { timeout: T }, async () => {
    const ctx = mcpTestContext();
    const prompt = buildToolLookupPrompt('Report the statistics of this fictional midfielder.', ['SYN-101']);
    expect(prompt).not.toContain(ctx.verificationId); // the value only exists at tool execution time

    const { outcome, toolCalls, elapsedMs } = await withDemoMcp(ctx, (mcp) =>
      runAgentWithLimits(createScoutingAgent(model, { mcpServers: mcp.servers }), { prompt }, { timeoutMs: 180_000 }),
    );
    expect(outcome.type).toBe('response');
    if (outcome.type !== 'response') return;

    const invocations = extractToolInvocations(outcome.messages);
    console.info('[tool-call]', JSON.stringify({ elapsedMs, usage: outcome.usage, toolCalls, invocations: invocations.map((i) => ({ ...i, resultText: i.resultText.slice(0, 120) })), serverLog: calls(ctx.invocationLogPath), output: outcome.output }));

    // 1. The server process actually executed the tool.
    expect(calls(ctx.invocationLogPath)).toContainEqual(expect.objectContaining({ playerId: 'SYN-101', outcome: 'ok' }));
    // 2. The run history holds the model's tool call and the genuine result.
    const genuine = invocations.find((i) => i.toolName === 'get_demo_player_stats' && i.status === 'ok');
    expect(genuine?.input).toEqual({ playerId: 'SYN-101' });
    expect(genuine?.resultText).toContain(ctx.verificationId);
    // 3. The validated final answer cites the execution-time value and the fixture numbers.
    expect(outcome.output.evidenceRefs).toContain(ctx.verificationId);
    expect(outcome.output.candidates[0]?.playerId).toBe('SYN-101');
    expect(() => assertToolEvidence(outcome.output, invocations)).not.toThrow();
    expect(toolCalls.length).toBeLessThanOrEqual(5);
  });

  it('handles a failing tool call without using its data', { timeout: T }, async () => {
    const ctx = mcpTestContext();
    const prompt = buildToolLookupPrompt('Compare these fictional players.', ['SYN-500', 'SYN-102']);
    const { outcome } = await withDemoMcp(ctx, (mcp) =>
      runAgentWithLimits(createScoutingAgent(model, { mcpServers: mcp.servers }), { prompt }, { timeoutMs: 180_000 }),
    );
    expect(outcome.type).toBe('response');
    if (outcome.type !== 'response') return;
    const invocations = extractToolInvocations(outcome.messages);
    console.info('[failing-tool]', JSON.stringify({ invocations: invocations.map((i) => ({ input: i.input, status: i.status, resultText: i.resultText.slice(0, 100) })), serverLog: calls(ctx.invocationLogPath), output: outcome.output }));
    expect(calls(ctx.invocationLogPath)).toContainEqual(expect.objectContaining({ playerId: 'SYN-500', outcome: 'internal_error' }));
    expect(invocations.find((i) => (i.input as { playerId?: string }).playerId === 'SYN-500')?.status).toBe('error');
    expect(outcome.output.candidates.map((c) => c.playerId)).not.toContain('SYN-500');
    expect(() => assertToolEvidence(outcome.output, invocations)).not.toThrow();
  });

  it('enforces max 5 tool calls: the 6th real attempt is rejected', { timeout: T }, async () => {
    const ctx = mcpTestContext();
    const ids = ['SYN-101', 'SYN-102', 'SYN-103', 'SYN-104', 'SYN-105', 'SYN-106'];
    const prompt = buildToolLookupPrompt('Look up EVERY listed player with a separate tool call before answering.', ids);
    let records: unknown;
    const error = await withDemoMcp(ctx, (mcp) =>
      runAgentWithLimits(createScoutingAgent(model, { mcpServers: mcp.servers }), { prompt }, { timeoutMs: 180_000 }).then(
        (r) => { records = r.toolCalls; return undefined; },
        (e: unknown) => e,
      ),
    );
    const executed = calls(ctx.invocationLogPath);
    console.info('[tool-limit]', JSON.stringify({ error: error instanceof Error ? `${error.name}: ${error.message}` : error, records, serverLog: executed }));
    expect(error).toBeInstanceOf(ToolCallLimitExceededError);
    expect(executed).toHaveLength(5);
  });

  it('times out a real run and cancels it promptly', { timeout: T }, async () => {
    const ctx = mcpTestContext();
    const started = performance.now();
    const error = await withDemoMcp(ctx, (mcp) =>
      runAgentWithLimits(createScoutingAgent(model, { mcpServers: mcp.servers }), { prompt: buildToolLookupPrompt('Report stats.', ['SYN-101']) }, { timeoutMs: 1_000 }).then(
        () => undefined,
        (e: unknown) => e,
      ),
    );
    const elapsed = Math.round(performance.now() - started);
    console.info('[timeout]', JSON.stringify({ error: toSpikeError(error, [config.apiKey]).message, elapsedMs: elapsed }));
    expect(error).toBeInstanceOf(RunTimeoutError);
    expect((error as RunTimeoutError).elapsedMs).toBeLessThan(1_500);
  });
});
