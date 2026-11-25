import type { PreparedBrief, ScoutingAssessment, ScoutingRequest } from './schemas.js';
import { EvidenceValidationError } from './errors.js';
import { assertToolEvidence, type ToolInvocation } from './mcp/evidence.js';

const per90 = (count: number, minutes: number): number => Math.round((count / minutes) * 90 * 100) / 100;

/** Deterministic filtering + per-90 normalization. The LLM never computes these values. */
export function prepareBrief(request: ScoutingRequest): PreparedBrief {
  const eligible: PreparedBrief['eligible'] = [];
  const excluded: PreparedBrief['excluded'] = [];

  for (const p of request.players) {
    if (p.positionGroup !== request.positionGroup) {
      excluded.push({ playerId: p.playerId, reason: `position ${p.positionGroup} != ${request.positionGroup}` });
    } else if (p.ageYears < request.ageMin || p.ageYears > request.ageMax) {
      excluded.push({ playerId: p.playerId, reason: `age ${p.ageYears} outside ${request.ageMin}-${request.ageMax}` });
    } else if (p.minutes < request.minMinutes) {
      excluded.push({ playerId: p.playerId, reason: `minutes ${p.minutes} < ${request.minMinutes}` });
    } else {
      eligible.push({
        playerId: p.playerId,
        name: p.name,
        ageYears: p.ageYears,
        metrics: {
          minutes: p.minutes,
          goalsPer90: per90(p.goals, p.minutes),
          assistsPer90: per90(p.assists, p.minutes),
          progressivePassesPer90: per90(p.progressivePasses, p.minutes),
        },
      });
    }
  }

  eligible.sort(
    (a, b) =>
      b.metrics.progressivePassesPer90 - a.metrics.progressivePassesPer90 || a.playerId.localeCompare(b.playerId),
  );
  return { brief: request.brief, positionGroup: request.positionGroup, eligible, excluded, lookupPlayerIds: [...request.lookupPlayerIds] };
}

/**
 * Deterministic post-check: every candidate must be an eligible player (numbers equal to the
 * engine's) or a requested lookup backed by a genuine tool result (numbers equal to the tool's,
 * verificationId cited). Rejects invented players, statistics and evidence references.
 */
export function assertEvidenceMatches(
  prepared: PreparedBrief,
  assessment: ScoutingAssessment,
  toolInvocations: readonly ToolInvocation[] = [],
): void {
  const byId = new Map(prepared.eligible.map((c) => [c.playerId, c]));
  const problems: string[] = [];
  const toolCandidates: ScoutingAssessment['candidates'] = [];

  if (assessment.verdict === 'candidates_found' && assessment.candidates.length === 0) {
    problems.push('verdict candidates_found with no candidates');
  }
  if (prepared.eligible.length === 0 && prepared.lookupPlayerIds.length === 0 && assessment.verdict !== 'insufficient_evidence') {
    problems.push('no eligible players but verdict is not insufficient_evidence');
  }
  for (const candidate of assessment.candidates) {
    const source = byId.get(candidate.playerId);
    if (source === undefined) {
      if (prepared.lookupPlayerIds.includes(candidate.playerId)) toolCandidates.push(candidate);
      else problems.push(`${candidate.playerId}: not an eligible player`);
      continue;
    }
    for (const { metric, value } of candidate.evidence) {
      if (Math.abs(source.metrics[metric] - value) > 0.01) {
        problems.push(`${candidate.playerId}.${metric}: cited ${value}, engine ${source.metrics[metric]}`);
      }
    }
  }
  if (toolCandidates.length > 0 || assessment.evidenceRefs.length > 0) {
    try {
      assertToolEvidence({ ...assessment, candidates: toolCandidates }, toolInvocations);
    } catch (error) {
      if (error instanceof EvidenceValidationError) problems.push(...error.problems);
      else throw error;
    }
  }
  if (problems.length > 0) throw new EvidenceValidationError(problems);
}
