import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompletionModel, Usage } from '@anvia/core';
import { defineMetric, EvalOutcome, type EvalCase } from '@anvia/core/evals';
import { buildToolLookupPrompt, createScoutingAgent } from '../agent.js';
import { EvidenceValidationError } from '../errors.js';
import { withDemoMcp } from '../mcp/client.js';
import { assertToolEvidence, extractToolInvocations, type ToolInvocation } from '../mcp/evidence.js';
import type { InvocationLogEntry } from '../mcp/server.js';
import { runAgentWithLimits } from '../runtime.js';
import type { Metric, ScoutingAssessment } from '../schemas.js';

export type ToolEvidenceInput = { brief: string; playerIds: string[] };
export type ToolEvidenceExpected = { playerId: string; metrics: Partial<Record<Metric, number>> };
export type ToolEvidenceOutput = {
  assessment: ScoutingAssessment;
  invocations: ToolInvocation[];
  serverCalls: InvocationLogEntry[];
  verificationId: string;
  usage: Usage;
};

/** Synthetic fixture expectations (values from src/mcp/fixtures.ts). */
export function toolEvidenceCases(injectWrongExpected = false): EvalCase<ToolEvidenceInput, ToolEvidenceExpected>[] {
  return [
    {
      id: 'mcp-lookup-SYN-101',
      input: { brief: 'Report this fictional midfielder. Cite minutes and progressivePassesPer90.', playerIds: ['SYN-101'] },
      expected: {
        playerId: 'SYN-101',
        // Deliberately wrong value when injecting a failure (fixture is 7.65).
        metrics: { minutes: 1530, progressivePassesPer90: injectWrongExpected ? 8.65 : 7.65 },
      },
      metadata: { dataset: 'synthetic' },
    },
  ];
}

/** Eval target: the existing Agent + real MCP server; verificationId exists only in the server env. */
export function toolEvidenceTarget(model: CompletionModel, timeoutMs = 180_000) {
  return async (input: ToolEvidenceInput): Promise<ToolEvidenceOutput> => {
    const verificationId = `VERIFY-${randomUUID()}`;
    const invocationLogPath = join(mkdtempSync(join(tmpdir(), 'wonderscout-eval-')), 'invocations.jsonl');
    const { outcome } = await withDemoMcp({ verificationId, invocationLogPath }, (mcp) =>
      runAgentWithLimits(
        createScoutingAgent(model, { mcpServers: mcp.servers }),
        { prompt: buildToolLookupPrompt(input.brief, input.playerIds) },
        { timeoutMs },
      ),
    );
    if (outcome.type !== 'response') throw new Error(`Agent run ended with ${outcome.type}`);
    const serverCalls = existsSync(invocationLogPath)
      ? readFileSync(invocationLogPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as InvocationLogEntry).filter((e) => e.event === 'call')
      : [];
    return { assessment: outcome.output, invocations: extractToolInvocations(outcome.messages), serverCalls, verificationId, usage: outcome.usage };
  };
}

type Args = { case: EvalCase<ToolEvidenceInput, ToolEvidenceExpected>; output: ToolEvidenceOutput };

/** Deterministic metrics only — no LLM judge decides numeric correctness (TDD §10.3). */
export const toolEvidenceMetrics = [
  defineMetric({
    name: 'mcp_tool_executed',
    required: true,
    evaluate: ({ case: c, output }: Args) => {
      const missing = c.input.playerIds.filter(
        (id) => !output.serverCalls.some((e) => e.playerId === id && e.outcome === 'ok') ||
          !output.invocations.some((i) => i.status === 'ok' && i.resultText.includes(output.verificationId) && (i.input as { playerId?: string }).playerId === id),
      );
      return missing.length === 0
        ? EvalOutcome.pass(true, { comment: `server executed ${output.serverCalls.length} call(s)` })
        : EvalOutcome.fail(false, { comment: `no genuine executed tool result for ${missing.join(', ')}` });
    },
  }),
  defineMetric({
    name: 'evidence_refs_match',
    required: true,
    evaluate: ({ output }: Args) => {
      try {
        assertToolEvidence(output.assessment, output.invocations);
      } catch (error) {
        if (error instanceof EvidenceValidationError) return EvalOutcome.fail(false, { comment: error.problems.join('; ') });
        throw error;
      }
      const refs = output.assessment.evidenceRefs;
      return refs.length === 1 && refs[0] === output.verificationId
        ? EvalOutcome.pass(true)
        : EvalOutcome.fail(false, { comment: `evidenceRefs ${JSON.stringify(refs)} != [execution verificationId]` });
    },
  }),
  defineMetric({
    name: 'expected_fixture_values',
    required: true,
    evaluate: ({ case: c, output }: Args) => {
      const expected = c.expected!;
      const candidate = output.assessment.candidates.find((x) => x.playerId === expected.playerId);
      if (candidate === undefined) return EvalOutcome.fail(false, { comment: `${expected.playerId} not among candidates` });
      const mismatches = Object.entries(expected.metrics).flatMap(([metric, value]) => {
        const cited = candidate.evidence.find((e) => e.metric === metric)?.value;
        return cited !== undefined && Math.abs(cited - value) <= 0.01 ? [] : [`${metric}: expected ${value}, cited ${cited ?? 'nothing'}`];
      });
      return mismatches.length === 0 ? EvalOutcome.pass(true) : EvalOutcome.fail(false, { comment: mismatches.join('; ') });
    },
  }),
] as const;

/** Reports the Agent run's token usage in the eval summary. */
export const toolEvidenceUsage = ({ output }: { output: ToolEvidenceOutput }) => output.usage;
