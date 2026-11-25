/** Eval mechanics with the real MCP server and a scripted model (deterministic, offline). */
import { describe, expect, it } from 'vitest';
import { evalExitCode, runEvalSuite } from '@anvia/core/evals';
import { toolEvidenceCases, toolEvidenceMetrics, toolEvidenceTarget } from '../src/evals/tool-evidence-eval.js';
import { ScriptedModel, text, toolCall } from './helpers/scripted-model.js';

const T = 30_000;

/** Scripted model that copies the verificationId from the genuine tool result it receives. */
function honestModel(value = 7.65) {
  return new ScriptedModel([
    () => [toolCall('SYN-101')],
    (req) => {
      const toolMsg = JSON.stringify(req.chatHistory);
      const ref = /VERIFY-[0-9a-f-]{36}/.exec(toolMsg)?.[0] ?? 'missing';
      return [text({ verdict: 'candidates_found', candidates: [{ playerId: 'SYN-101', rank: 1, summary: 's', evidence: [{ metric: 'minutes', value: 1530 }, { metric: 'progressivePassesPer90', value }] }], limitations: ['synthetic'], evidenceRefs: [ref] })];
    },
  ]);
}

const run = (model: ScriptedModel, inject = false) =>
  runEvalSuite({ name: 'tool-evidence', cases: toolEvidenceCases(inject), target: toolEvidenceTarget(model, 20_000), metrics: toolEvidenceMetrics });

describe('tool-evidence eval', () => {
  it('passes with genuine tool execution and matching evidenceRefs (exit code 0)', { timeout: T }, async () => {
    const result = await run(honestModel());
    expect(result.metrics).toMatchObject({ total: 3, passed: 3, failed: 0, invalid: 0 });
    expect(evalExitCode(result)).toBe(0);
  });

  it('fails on a deliberately wrong expected value (exit code 1)', { timeout: T }, async () => {
    const result = await run(honestModel(), true);
    expect(result.results[0]!.scores.expected_fixture_values.outcome).toBe('fail');
    expect(result.results[0]!.scores.mcp_tool_executed.outcome).toBe('pass');
    expect(evalExitCode(result)).toBe(1);
  });

  it('fails when the model fabricates the verification reference', { timeout: T }, async () => {
    const liar = new ScriptedModel([
      () => [toolCall('SYN-101')],
      () => [text({ verdict: 'candidates_found', candidates: [{ playerId: 'SYN-101', rank: 1, summary: 's', evidence: [{ metric: 'progressivePassesPer90', value: 7.65 }] }], limitations: ['x'], evidenceRefs: ['VERIFY-00000000-0000-0000-0000-000000000000'] })],
    ]);
    const result = await run(liar);
    expect(result.results[0]!.scores.evidence_refs_match.outcome).toBe('fail');
    expect(evalExitCode(result)).toBe(1);
  });

  it('fails when no tool is executed (answer invented without MCP)', { timeout: T }, async () => {
    const noTool = new ScriptedModel([
      () => [text({ verdict: 'candidates_found', candidates: [{ playerId: 'SYN-101', rank: 1, summary: 's', evidence: [{ metric: 'progressivePassesPer90', value: 7.65 }] }], limitations: ['x'], evidenceRefs: [] })],
    ]);
    const result = await run(noTool);
    expect(result.results[0]!.scores.mcp_tool_executed.outcome).toBe('fail');
    expect(evalExitCode(result)).toBe(1);
  });
});
