import { AgentStructuredOutputError } from '@anvia/core';
import { ZodError } from 'zod';
import { redact } from './redact.js';

export class InvalidInputError extends Error {
  override readonly name = 'InvalidInputError';
  constructor(readonly issues: readonly string[], options?: ErrorOptions) {
    super(`Invalid scouting request: ${issues.join('; ')}`, options);
  }
}

/** HTTP/network failure from the model provider. Message is redacted. */
export class ProviderError extends Error {
  override readonly name = 'ProviderError';
  constructor(message: string, readonly statusCode: number | undefined, options?: ErrorOptions) {
    super(message, options);
  }
}

/** The model answered, but the answer failed local JSON/Zod validation. */
export class InvalidAgentOutputError extends Error {
  override readonly name = 'InvalidAgentOutputError';
  constructor(readonly phase: string, readonly attempts: number, options?: ErrorOptions) {
    super(`Agent output rejected during ${phase} after ${attempts} attempt(s)`, options);
  }
}

/** Valid JSON that cites players/numbers not produced by the deterministic step. */
export class EvidenceValidationError extends Error {
  override readonly name = 'EvidenceValidationError';
  constructor(readonly problems: readonly string[]) {
    super(`Evidence validation failed: ${problems.join('; ')}`);
  }
}

export type SpikeError = InvalidInputError | ProviderError | InvalidAgentOutputError | EvidenceValidationError;

function statusOf(error: unknown): number | undefined {
  for (let e: unknown = error, depth = 0; e !== null && typeof e === 'object' && depth < 5; depth++) {
    const record = e as { status?: unknown; statusCode?: unknown; cause?: unknown };
    if (typeof record.status === 'number') return record.status;
    if (typeof record.statusCode === 'number') return record.statusCode;
    e = record.cause;
  }
  return undefined;
}

/** Maps Anvia/OpenAI/Zod errors to the spike's typed errors without leaking secrets. */
export function toSpikeError(error: unknown, secrets: readonly string[] = []): SpikeError | Error {
  if (
    error instanceof InvalidInputError ||
    error instanceof ProviderError ||
    error instanceof InvalidAgentOutputError ||
    error instanceof EvidenceValidationError
  ) {
    return error;
  }
  if (error instanceof ZodError) {
    return new InvalidInputError(error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
  }
  if (error instanceof AgentStructuredOutputError) {
    return new InvalidAgentOutputError(error.phase, error.attempt, { cause: error });
  }
  const status = statusOf(error);
  const message = redact(error instanceof Error ? error.message : String(error), secrets);
  if (status !== undefined || (error instanceof Error && /fetch|network|ECONN|timeout/i.test(error.message))) {
    // Cause intentionally dropped: SDK errors can carry request headers.
    return new ProviderError(`Provider request failed${status ? ` (HTTP ${status})` : ''}: ${message}`, status);
  }
  return error instanceof Error ? new Error(message) : new Error(String(error));
}
