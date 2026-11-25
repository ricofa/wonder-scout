import { createMiddleware, type AgentMiddleware } from '@anvia/core';

export const MAX_TOOL_CALLS_PER_RUN = 5;

export class RunTimeoutError extends Error {
  override readonly name = 'RunTimeoutError';
  constructor(readonly timeoutMs: number, readonly elapsedMs: number) {
    super(`Agent run timed out after ${timeoutMs} ms (cancelled at ${elapsedMs} ms)`);
  }
}

export class ToolCallLimitExceededError extends Error {
  override readonly name = 'ToolCallLimitExceededError';
  constructor(readonly limit: number, readonly toolName: string) {
    super(`Tool call limit of ${limit} per run exceeded; call #${limit + 1} to ${toolName} was rejected before execution`);
  }
}

export type ToolCallRecord = { index: number; toolName: string; args: string; status: 'allowed' | 'rejected' };

/**
 * Per-run tool-call budget. `onToolInput` runs before the tool executes; the call that would
 * exceed the limit throws (so the tool is never invoked) and aborts the whole run.
 */
export function createToolCallBudget(limit: number, abort: (error: Error) => void) {
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError('tool-call limit must be a non-negative integer');
  const calls: ToolCallRecord[] = [];
  let exceeded: ToolCallLimitExceededError | undefined;

  const middleware: AgentMiddleware = createMiddleware({
    onToolInput: ({ toolName, args }) => {
      const index = calls.length + 1;
      if (exceeded !== undefined || index > limit) {
        calls.push({ index, toolName, args, status: 'rejected' });
        exceeded ??= new ToolCallLimitExceededError(limit, toolName);
        abort(exceeded);
        throw exceeded;
      }
      calls.push({ index, toolName, args, status: 'allowed' });
      return undefined;
    },
  });

  return {
    middleware,
    get calls(): readonly ToolCallRecord[] { return calls; },
    get allowedCount(): number { return calls.filter((c) => c.status === 'allowed').length; },
    get exceeded(): ToolCallLimitExceededError | undefined { return exceeded; },
  };
}

export type RunLimits = {
  /** Wall-clock limit for the whole run, including model calls and tool calls. */
  timeoutMs: number;
  maxToolCalls?: number;
  /** Optional caller cancellation, combined with the timeout. */
  abortSignal?: AbortSignal;
};

type RunnableAgent<Options, Outcome> = { generate(options: Options): Promise<Outcome> };

/**
 * Runs an Agent with a real per-run timeout (AbortSignal propagated to the model HTTP request
 * and to MCP tool calls, which send a cancellation to the server) and a code-enforced
 * tool-call budget. Timer and listeners are always cleaned up.
 */
export async function runAgentWithLimits<Options extends object, Outcome>(
  agent: RunnableAgent<Options, Outcome>,
  options: Omit<Options, 'abortSignal' | 'middlewares'>,
  limits: RunLimits,
): Promise<{ outcome: Outcome; toolCalls: readonly ToolCallRecord[]; elapsedMs: number }> {
  const controller = new AbortController();
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new RunTimeoutError(limits.timeoutMs, elapsed()));
  }, limits.timeoutMs);
  const onCallerAbort = () => controller.abort(limits.abortSignal?.reason);
  limits.abortSignal?.addEventListener('abort', onCallerAbort, { once: true });

  const budget = createToolCallBudget(limits.maxToolCalls ?? MAX_TOOL_CALLS_PER_RUN, (error) => controller.abort(error));
  try {
    const outcome = await agent.generate({
      ...options,
      abortSignal: controller.signal,
      middlewares: [budget.middleware],
    } as unknown as Options);
    if (budget.exceeded !== undefined) throw budget.exceeded;
    return { outcome, toolCalls: budget.calls, elapsedMs: elapsed() };
  } catch (error) {
    if (budget.exceeded !== undefined) throw budget.exceeded;
    if (timedOut) throw new RunTimeoutError(limits.timeoutMs, elapsed());
    throw error;
  } finally {
    clearTimeout(timer);
    limits.abortSignal?.removeEventListener('abort', onCallerAbort);
  }
}
