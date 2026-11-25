/**
 * Runtime controls with the REAL MCP server and a scripted model (deterministic, offline).
 * Proves enforcement mechanics; real-model behaviour is covered by the live suite.
 */
import { describe, expect, it } from 'vitest';
import { createScoutingAgent, buildToolLookupPrompt } from '../src/agent.js';
import { withDemoMcp } from '../src/mcp/client.js';
import { assertToolEvidence, extractToolInvocations } from '../src/mcp/evidence.js';
import { EvidenceValidationError } from '../src/errors.js';
import { runAgentWithLimits, RunTimeoutError, ToolCallLimitExceededError } from '../src/runtime.js';
import { hangUntilAborted, ScriptedModel, text, toolCall } from './helpers/scripted-model.js';
import { isProcessAlive, mcpTestContext, readInvocationLog, waitFor } from './helpers/mcp-test-utils.js';

const T = 30_000;
const IDS = ['SYN-101', 'SYN-102', 'SYN-103', 'SYN-104', 'SYN-105', 'SYN-106'];
const final = (verificationId: string) =>
  text({
    verdict: 'candidates_found',
    candidates: [{ playerId: 'SYN-101', rank: 1, summary: 'ok', evidence: [{ metric: 'progressivePassesPer90', value: 7.65 }] }],
    limitations: ['synthetic'],
    evidenceRefs: [verificationId],
  });
const okCalls = (path: string) => readInvocationLog(path).filter((e) => e.event === 'call' && e.outcome === 'ok');

describe('tool-call limit (max 5 per run)', () => {
  it('allows 5 sequential calls and rejects the 6th before execution', { timeout: T }, async () => {
    const ctx = mcpTestContext();
    const model = new ScriptedModel([...IDS.map((id) => () => [toolCall(id)]), () => [final(ctx.verificationId)]]);
    const error = await withDemoMcp(ctx, (mcp) =>
      runAgentWithLimits(createScoutingAgent(model, { mcpServers: mcp.servers, maxTurns: 10 }), { prompt: 'x' }, { timeoutMs: 20_000 }).then(
        () => undefined,
        (e: unknown) => e,
      ),
    );
    expect(error).toBeInstanceOf(ToolCallLimitExceededError);
    expect(okCalls(ctx.invocationLogPath).map((e) => e.playerId)).toEqual(IDS.slice(0, 5));
    expect(model.calls).toBe(6); // the run stopped; no further model turn after the rejection
  });

  it('rejects the 6th of 6 parallel calls requested in one model turn', { timeout: T }, async () => {
    const ctx = mcpTestContext();
    const model = new ScriptedModel([() => IDS.map(toolCall), () => [final(ctx.verificationId)]]);
    const error = await withDemoMcp(ctx, (mcp) =>
      runAgentWithLimits(createScoutingAgent(model, { mcpServers: mcp.servers }), { prompt: 'x' }, { timeoutMs: 20_000 }).then(
        () => undefined,
        (e: unknown) => e,
      ),
    );
    expect(error).toBeInstanceOf(ToolCallLimitExceededError);
    expect(okCalls(ctx.invocationLogPath)).toHaveLength(5);
    expect(readInvocationLog(ctx.invocationLogPath).some((e) => e.playerId === 'SYN-106')).toBe(false);
  });

  it('passes runs within the limit and records each call', { timeout: T }, async () => {
    const ctx = mcpTestContext();
    const model = new ScriptedModel([() => [toolCall('SYN-101')], () => [final(ctx.verificationId)]]);
    const { outcome, toolCalls } = await withDemoMcp(ctx, (mcp) =>
      runAgentWithLimits(createScoutingAgent(model, { mcpServers: mcp.servers }), { prompt: buildToolLookupPrompt('b', ['SYN-101']) }, { timeoutMs: 20_000 }),
    );
    expect(toolCalls).toEqual([expect.objectContaining({ index: 1, toolName: 'get_demo_player_stats', status: 'allowed' })]);
    expect(outcome.type).toBe('response');
    if (outcome.type === 'response') expect(() => assertToolEvidence(outcome.output, extractToolInvocations(outcome.messages))).not.toThrow();
  });
});

describe('per-run timeout with cancellation', () => {
  it('cancels an in-flight MCP tool call; the server observes the cancellation', { timeout: T }, async () => {
    const ctx = mcpTestContext();
    const model = new ScriptedModel([() => [toolCall('SYN-900')], () => [final(ctx.verificationId)]]);
    let pid = 0;
    const started = performance.now();
    const error = await withDemoMcp({ ...ctx, slowDelayMs: 15_000 }, (mcp) => {
      pid = readInvocationLog(ctx.invocationLogPath).filter((e) => e.event === 'started').at(-1)!.pid;
      return runAgentWithLimits(createScoutingAgent(model, { mcpServers: mcp.servers }), { prompt: 'x' }, { timeoutMs: 800 }).then(
        () => undefined,
        (e: unknown) => e,
      );
    });
    const elapsed = performance.now() - started;
    expect(error).toBeInstanceOf(RunTimeoutError);
    expect(elapsed).toBeLessThan(5_000); // not the 15 s tool duration
    expect(await waitFor(() => readInvocationLog(ctx.invocationLogPath).some((e) => e.playerId === 'SYN-900' && e.outcome === 'cancelled'))).toBe(true);
    expect(await waitFor(() => !isProcessAlive(pid))).toBe(true); // cleanup after timeout
  });

  it('cancels a hanging model call', { timeout: T }, async () => {
    const model = new ScriptedModel([hangUntilAborted]);
    const started = performance.now();
    await expect(runAgentWithLimits(createScoutingAgent(model), { prompt: 'x' }, { timeoutMs: 300 })).rejects.toBeInstanceOf(RunTimeoutError);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

describe('assertToolEvidence', () => {
  const invocation = (verificationId: string) => ({
    toolCallId: 'c1',
    toolName: 'get_demo_player_stats',
    input: { playerId: 'SYN-101' },
    status: 'ok' as const,
    resultText: JSON.stringify({ verificationId, player: { playerId: 'SYN-101', metrics: { progressivePassesPer90: 7.65 } } }),
  });
  const assessment = (ref: string, value = 7.65) => ({
    verdict: 'candidates_found' as const,
    candidates: [{ playerId: 'SYN-101', rank: 1, summary: 's', evidence: [{ metric: 'progressivePassesPer90' as const, value }] }],
    limitations: ['synthetic'],
    evidenceRefs: [ref],
  });

  it('accepts evidence backed by a genuine tool result', () => {
    expect(() => assertToolEvidence(assessment('V-1'), [invocation('V-1')])).not.toThrow();
  });
  it('rejects a hallucinated verification ID, altered numbers, and missing tool calls', () => {
    expect(() => assertToolEvidence(assessment('V-FAKE'), [invocation('V-1')])).toThrow(EvidenceValidationError);
    expect(() => assertToolEvidence(assessment('V-1', 9.99), [invocation('V-1')])).toThrow(EvidenceValidationError);
    expect(() => assertToolEvidence(assessment('V-1'), [])).toThrow(EvidenceValidationError);
    expect(() => assertToolEvidence(assessment('V-1'), [{ ...invocation('V-1'), status: 'error' }])).toThrow(EvidenceValidationError);
  });
});
