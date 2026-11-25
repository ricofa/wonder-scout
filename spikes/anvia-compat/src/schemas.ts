import { z } from 'zod';

/** Fictional players only: IDs are namespaced `SYN-###` so real data cannot be confused with fixtures. */
export const PositionGroupSchema = z.enum(['GK', 'DEF', 'MID', 'FWD']);

export const SyntheticPlayerSchema = z.object({
  playerId: z.string().regex(/^SYN-\d{3}$/, 'synthetic player IDs must look like SYN-001'),
  name: z.string().min(1),
  ageYears: z.int().min(16).max(25),
  positionGroup: PositionGroupSchema,
  minutes: z.int().nonnegative(),
  goals: z.int().nonnegative(),
  assists: z.int().nonnegative(),
  progressivePasses: z.int().nonnegative(),
});

export const ScoutingRequestSchema = z
  .object({
    dataset: z.literal('synthetic'),
    brief: z.string().trim().min(10).max(500),
    positionGroup: PositionGroupSchema,
    ageMin: z.int().min(16).max(25).default(18),
    ageMax: z.int().min(16).max(25).default(23),
    minMinutes: z.int().nonnegative().default(450),
    players: z.array(SyntheticPlayerSchema).min(1).max(20),
    /** Extra synthetic IDs the Agent must fetch through the MCP tool (no statistics supplied). */
    lookupPlayerIds: z.array(z.string().regex(/^SYN-\d{3}$/)).max(5).default([]),
  })
  .refine((r) => r.ageMin <= r.ageMax, { message: 'ageMin must be <= ageMax', path: ['ageMin'] });

export type ScoutingRequestInput = z.input<typeof ScoutingRequestSchema>;
export type ScoutingRequest = z.output<typeof ScoutingRequestSchema>;

export const MetricSchema = z.enum(['minutes', 'goalsPer90', 'assistsPer90', 'progressivePassesPer90']);
export type Metric = z.infer<typeof MetricSchema>;

export const PreparedCandidateSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  ageYears: z.int(),
  metrics: z.object({
    minutes: z.number(),
    goalsPer90: z.number(),
    assistsPer90: z.number(),
    progressivePassesPer90: z.number(),
  }),
});

export const PreparedBriefSchema = z.object({
  brief: z.string(),
  positionGroup: PositionGroupSchema,
  eligible: z.array(PreparedCandidateSchema),
  excluded: z.array(z.object({ playerId: z.string(), reason: z.string() })),
  lookupPlayerIds: z.array(z.string()),
});
export type PreparedBrief = z.infer<typeof PreparedBriefSchema>;

/** Agent output contract. Validated locally by Anvia (and again by the pipeline). */
export const ScoutingAssessmentSchema = z.object({
  verdict: z.enum(['candidates_found', 'insufficient_evidence']),
  candidates: z
    .array(
      z.object({
        playerId: z.string(),
        rank: z.int().min(1).max(5),
        summary: z.string().min(1).max(400),
        evidence: z.array(z.object({ metric: MetricSchema, value: z.number() })).min(1),
      }),
    )
    .max(5),
  limitations: z.array(z.string().min(1)).min(1),
  /** Verification IDs returned by tools whose results were used; [] when no tool was used. */
  evidenceRefs: z.array(z.string().min(1)),
});
export type ScoutingAssessment = z.infer<typeof ScoutingAssessmentSchema>;

export const ScoutingResultSchema = z.object({
  dataset: z.literal('synthetic'),
  assessment: ScoutingAssessmentSchema,
  excluded: PreparedBriefSchema.shape.excluded,
});
export type ScoutingResult = z.infer<typeof ScoutingResultSchema>;
