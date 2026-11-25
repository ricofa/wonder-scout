import type { Message } from '@anvia/core';
import { EvidenceValidationError } from '../errors.js';
import type { ScoutingAssessment } from '../schemas.js';
import { DEMO_TOOL_NAME } from './server.js';

export type ToolInvocation = {
  toolCallId: string;
  toolName: string;
  input: unknown;
  status: 'ok' | 'error' | 'missing-result';
  resultText: string;
};

/** Tool calls and their genuine results as recorded in the run's message history. */
export function extractToolInvocations(messages: readonly Message[]): ToolInvocation[] {
  const calls = new Map<string, ToolInvocation>();
  for (const message of messages) {
    if (message.role === 'assistant' && typeof message.content !== 'string') {
      for (const part of message.content) {
        if (part.type === 'tool-call') {
          calls.set(part.toolCallId, { toolCallId: part.toolCallId, toolName: part.toolName, input: part.input, status: 'missing-result', resultText: '' });
        }
      }
    }
    if (message.role === 'tool') {
      for (const part of message.content) {
        if (part.type !== 'tool-result') continue;
        const call = calls.get(part.toolCallId);
        if (call === undefined) continue;
        const out = part.output;
        call.status = out.type === 'error-text' || out.type === 'error-json' || out.type === 'execution-denied' ? 'error' : 'ok';
        call.resultText =
          out.type === 'content' ? out.value.map((p) => (p.type === 'text' ? p.text : '')).join('')
          : out.type === 'json' || out.type === 'error-json' ? JSON.stringify(out.value)
          : out.type === 'execution-denied' ? (out.reason ?? '')
          : out.value;
      }
    }
  }
  return [...calls.values()];
}

type ToolPlayerResult = {
  verificationId: string;
  player: { playerId: string; metrics: Record<string, number> };
};

function parseToolResult(text: string): ToolPlayerResult | undefined {
  try {
    const value = JSON.parse(text) as Partial<ToolPlayerResult>;
    if (typeof value.verificationId === 'string' && value.player !== undefined) return value as ToolPlayerResult;
  } catch {}
  return undefined;
}

/**
 * Deterministic check for tool-sourced answers: each candidate must come from a successful
 * get_demo_player_stats result, cited numbers must equal that result, and evidenceRefs must
 * contain the execution-time verificationId the tool returned.
 */
export function assertToolEvidence(assessment: ScoutingAssessment, invocations: readonly ToolInvocation[]): void {
  const results = invocations
    .filter((i) => i.toolName === DEMO_TOOL_NAME && i.status === 'ok')
    .map((i) => parseToolResult(i.resultText))
    .filter((r): r is ToolPlayerResult => r !== undefined);
  const byPlayer = new Map(results.map((r) => [r.player.playerId, r]));
  const problems: string[] = [];

  for (const candidate of assessment.candidates) {
    const source = byPlayer.get(candidate.playerId);
    if (source === undefined) {
      problems.push(`${candidate.playerId}: no successful tool result`);
      continue;
    }
    if (!assessment.evidenceRefs.includes(source.verificationId)) {
      problems.push(`${candidate.playerId}: verificationId from tool not cited in evidenceRefs`);
    }
    for (const { metric, value } of candidate.evidence) {
      const actual = source.player.metrics[metric];
      if (actual === undefined || Math.abs(actual - value) > 0.01) {
        problems.push(`${candidate.playerId}.${metric}: cited ${value}, tool returned ${actual}`);
      }
    }
  }
  const known = new Set(results.map((r) => r.verificationId));
  for (const ref of assessment.evidenceRefs) if (!known.has(ref)) problems.push(`evidenceRef ${ref} not returned by any tool call`);
  if (problems.length > 0) throw new EvidenceValidationError(problems);
}
