import type { Message } from '@anvia/core';
import { Pipeline, type PipelineObservabilityOptions } from '@anvia/core/pipeline';
import { buildAgentPrompt, type ScoutingAgent } from './agent.js';
import { extractToolInvocations } from './mcp/evidence.js';
import { assertEvidenceMatches, prepareBrief } from './preprocess.js';
import { createToolCallBudget, MAX_TOOL_CALLS_PER_RUN } from './runtime.js';
import { PreparedBriefSchema, ScoutingRequestSchema, ScoutingResultSchema } from './schemas.js';

export const SCOUTING_PIPELINE_ID = 'synthetic-scouting-pipeline';

export type ScoutingPipelineOptions = {
  /** Trace observers (e.g. Lens); use the Agent's primaryTrace name to link the traces. */
  observability?: PipelineObservabilityOptions;
  maxToolCalls?: number;
};

type AgentRunState = { messages: readonly Message[]; budget: ReturnType<typeof createToolCallBudget> };

/**
 * input (Zod) → preprocess (deterministic) → [carry prepared ‖ agent] → validate-output (Zod + evidence).
 * The parallel stage keeps the deterministic data available for the post-agent evidence check.
 * Per run, the agent stage gets a tool-call budget and records its messages so the validate step
 * can check tool-sourced evidence against genuine tool results.
 */
export function createScoutingPipeline(agent: ScoutingAgent, options: ScoutingPipelineOptions = {}) {
  const runs = new Map<string, AgentRunState>();
  const maxToolCalls = options.maxToolCalls ?? MAX_TOOL_CALLS_PER_RUN;

  return new Pipeline({
    id: SCOUTING_PIPELINE_ID,
    inputSchema: ScoutingRequestSchema,
    ...(options.observability === undefined ? {} : { observability: options.observability }),
  })
    .step({ id: 'preprocess', run: ({ input }) => prepareBrief(input) })
    .parallel({
      id: 'assess',
      branches: {
        prepared: new Pipeline({ id: 'carry-prepared', inputSchema: PreparedBriefSchema }),
        assessment: new Pipeline({ id: 'agent-branch', inputSchema: PreparedBriefSchema }).agent({
          id: 'scouting-agent',
          agent,
          suspension: 'reject',
          request: ({ input, runId }) => {
            // Over-limit calls are rejected before execution; the run then fails in validate-output.
            const state: AgentRunState = { messages: [], budget: createToolCallBudget(maxToolCalls, () => {}) };
            runs.set(runId, state);
            return {
              prompt: buildAgentPrompt(input),
              middlewares: [state.budget.middleware],
              lifecycle: { onFinish: (event) => { state.messages = event.messages as readonly Message[]; } },
            };
          },
        }),
      },
    })
    .step({
      id: 'validate-output',
      run: ({ input, runId }) => {
        const state = runs.get(runId);
        runs.delete(runId);
        if (state?.budget.exceeded !== undefined) throw state.budget.exceeded;
        assertEvidenceMatches(input.prepared, input.assessment, extractToolInvocations(state?.messages ?? []));
        return ScoutingResultSchema.parse({
          dataset: 'synthetic',
          assessment: input.assessment,
          excluded: input.prepared.excluded,
        });
      },
    });
}

export type ScoutingPipeline = ReturnType<typeof createScoutingPipeline>;
