import { Agent, AgentStructuredOutputError } from '@anvia/core';
import type { AgentObservabilityOptions } from '@anvia/core/observability';
import type { McpServer } from '@anvia/mcp';
import type { CompletionModel } from '@anvia/core';
import { ScoutingAssessmentSchema, type PreparedBrief } from './schemas.js';

export const SCOUTING_AGENT_ID = 'synthetic-scouting-agent';

const INSTRUCTIONS = `You are a football scouting analyst working ONLY with fictional, synthetic players.
You receive a JSON request with a scouting brief and candidate data from one of two sources:
(a) "eligibleCandidates": metrics already computed deterministically, or
(b) "playersToLookUp": player IDs whose statistics you MUST fetch with the get_demo_player_stats tool, one call per ID.
Rules:
- Rank at most 5 candidates, best first, using only provided or tool-returned data. Never invent players.
- Every evidence value must be copied exactly from the candidate's metrics or from the tool result. Never compute, round or alter numbers.
- Never guess tool results. If a tool call fails, do not use that player; mention it in limitations.
- "evidenceRefs" must list the verificationId of every tool result you used, copied exactly; use [] if you used no tool.
- If there is no usable candidate data, return verdict "insufficient_evidence" with an empty candidates array.
- Always list at least one limitation (e.g. synthetic data, small sample).
Respond with ONLY a JSON object of this exact shape, no prose and no code fences:
{"verdict":"candidates_found"|"insufficient_evidence","candidates":[{"playerId":string,"rank":integer 1-5,"summary":string (max 400 chars),"evidence":[{"metric":"minutes"|"goalsPer90"|"assistsPer90"|"progressivePassesPer90","value":number}]}],"limitations":[string],"evidenceRefs":[string]}`;

export type ScoutingAgentOptions = {
  /** Output token budget. The model spends part of it on reasoning tokens. */
  maxTokens?: number;
  /** Connected MCP servers whose tools the Agent may call (caller owns the connection). */
  mcpServers?: readonly McpServer[];
  /** Model turns per run (each tool round-trip is one turn). The tool-call limit is enforced separately. */
  maxTurns?: number;
  /** Trace observers (e.g. Lens). Use the same primaryTrace name as the Pipeline to link traces. */
  observability?: AgentObservabilityOptions;
};

/**
 * The single synthetic test Agent. `outputSchema` makes Anvia (a) send
 * response_format=json_schema (accepted but NOT enforced by the Devscale/deepseek
 * gateway — see the compatibility report) and (b) JSON-parse + Zod-validate locally,
 * re-asking the model once on a parse/schema failure.
 */
export function createScoutingAgent(model: CompletionModel, options: ScoutingAgentOptions = {}) {
  return new Agent({
    id: SCOUTING_AGENT_ID,
    name: 'Synthetic Scouting Agent',
    model,
    instructions: INSTRUCTIONS,
    outputSchema: ScoutingAssessmentSchema,
    temperature: 0,
    maxTokens: options.maxTokens ?? 4000,
    maxTurns: options.maxTurns ?? (options.mcpServers === undefined ? 2 : 8),
    ...(options.mcpServers === undefined ? {} : { mcpServers: options.mcpServers }),
    ...(options.observability === undefined ? {} : { observability: options.observability }),
    // Retry only structured-output failures; never retry auth/model errors.
    retries: { maxAttempts: 2, shouldRetry: ({ error }) => error instanceof AgentStructuredOutputError },
  });
}

export type ScoutingAgent = ReturnType<typeof createScoutingAgent>;

export function buildAgentPrompt(prepared: PreparedBrief): string {
  return JSON.stringify({
    brief: prepared.brief,
    positionGroup: prepared.positionGroup,
    eligibleCandidates: prepared.eligible,
    ...(prepared.lookupPlayerIds.length > 0 ? { playersToLookUp: prepared.lookupPlayerIds } : {}),
  });
}

/** Prompt for tool-sourced candidates: only IDs, never statistics or verification values. */
export function buildToolLookupPrompt(brief: string, playerIds: readonly string[]): string {
  return JSON.stringify({ brief, playersToLookUp: playerIds });
}
