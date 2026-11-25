import { Usage, type CompletionModel, type CompletionRequest, type CompletionResponse, type ModelCallOptions, type AssistantContentPart } from '@anvia/core';

export type ScriptStep = (request: CompletionRequest, options: ModelCallOptions | undefined) => Promise<AssistantContentPart[]> | AssistantContentPart[];

/**
 * Deterministic CompletionModel for offline runtime-control tests (NOT used for compatibility
 * approval). Each completion() call consumes the next script step.
 */
export class ScriptedModel implements CompletionModel {
  readonly provider = 'scripted';
  readonly modelId = 'scripted-test-model';
  readonly capabilities = { streaming: false, tools: true, toolChoice: true, imageInput: false, documentInput: false, outputSchema: true, reasoning: false };
  calls = 0;
  constructor(private readonly steps: readonly ScriptStep[]) {}

  async completion(request: CompletionRequest, options?: ModelCallOptions): Promise<CompletionResponse> {
    const step = this.steps[Math.min(this.calls, this.steps.length - 1)]!;
    this.calls += 1;
    const choice = await step(request, options);
    const finishReason = choice.some((p) => p.type === 'tool-call') ? 'tool-calls' : 'stop';
    return { choice, usage: Usage.empty(), finishReason, rawResponse: null };
  }
}

let seq = 0;
export const toolCall = (playerId: string): AssistantContentPart => ({
  type: 'tool-call',
  toolCallId: `call_${++seq}`,
  toolName: 'get_demo_player_stats',
  input: { playerId },
});

export const text = (value: unknown): AssistantContentPart => ({ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) });

/** A model step that never answers until its abort signal fires. */
export const hangUntilAborted: ScriptStep = (_req, options) =>
  new Promise((_resolve, reject) => {
    const signal = options?.abortSignal;
    if (signal === undefined) return;
    signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true });
  });
