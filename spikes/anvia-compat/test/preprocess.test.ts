import { describe, expect, it } from 'vitest';
import { EvidenceValidationError } from '../src/errors.js';
import { assertEvidenceMatches, prepareBrief } from '../src/preprocess.js';
import { ScoutingAssessmentSchema, ScoutingRequestSchema } from '../src/schemas.js';
import { syntheticRequest } from './fixtures/synthetic-request.js';

const prepared = prepareBrief(ScoutingRequestSchema.parse(syntheticRequest));

describe('prepareBrief (deterministic)', () => {
  it('filters by position, age and minutes and computes per-90 values', () => {
    expect(prepared.eligible.map((c) => c.playerId)).toEqual(['SYN-003', 'SYN-001', 'SYN-002']);
    expect(prepared.eligible[1]?.metrics).toEqual({
      minutes: 1800,
      goalsPer90: 0.15,
      assistsPer90: 0.3,
      progressivePassesPer90: 8,
    });
    expect(prepared.excluded.map((e) => e.playerId).sort()).toEqual(['SYN-004', 'SYN-005', 'SYN-006']);
  });

  it('is deterministic', () => {
    expect(prepareBrief(ScoutingRequestSchema.parse(syntheticRequest))).toEqual(prepared);
  });
});

describe('assertEvidenceMatches', () => {
  const valid = {
    verdict: 'candidates_found' as const,
    candidates: [{ playerId: 'SYN-001', rank: 1, summary: 'ok', evidence: [{ metric: 'progressivePassesPer90' as const, value: 8 }] }],
    limitations: ['synthetic'],
    evidenceRefs: [],
  };

  it('accepts evidence copied from the engine', () => {
    expect(() => assertEvidenceMatches(prepared, valid)).not.toThrow();
  });

  it('rejects invented players and altered numbers', () => {
    const bad = {
      ...valid,
      candidates: [
        { ...valid.candidates[0]!, evidence: [{ metric: 'goalsPer90' as const, value: 0.9 }] },
        { playerId: 'SYN-999', rank: 2, summary: 'invented', evidence: [{ metric: 'minutes' as const, value: 1 }] },
      ],
    };
    expect(() => assertEvidenceMatches(prepared, bad)).toThrow(EvidenceValidationError);
  });
});

describe('ScoutingAssessmentSchema (local Zod validation)', () => {
  it('rejects malformed agent output', () => {
    expect(ScoutingAssessmentSchema.safeParse({ verdict: 'maybe', candidates: [] }).success).toBe(false);
    expect(ScoutingAssessmentSchema.safeParse({ verdict: 'insufficient_evidence', candidates: [], limitations: [], evidenceRefs: [] }).success).toBe(false);
  });
});
