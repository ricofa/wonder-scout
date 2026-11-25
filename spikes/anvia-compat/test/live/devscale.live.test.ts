/**
 * LIVE tests against the real Devscale Gateway. No mocks.
 * Run with `pnpm test:live` (loads ../../.env). Never logs credentials.
 */
import { Agent, AgentStructuredOutputError, generateCompletion } from '@anvia/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createScoutingAgent, buildAgentPrompt } from '../../src/agent.js';
import { InvalidAgentOutputError, ProviderError, toSpikeError } from '../../src/errors.js';
import { createChatModel, loadModelConfig } from '../../src/model-config.js';
import { createScoutingPipeline } from '../../src/pipeline.js';
import { assertEvidenceMatches, prepareBrief } from '../../src/preprocess.js';
import { ScoutingRequestSchema, ScoutingResultSchema } from '../../src/schemas.js';
import { syntheticRequest } from '../fixtures/synthetic-request.js';

const config = loadModelConfig();
const secrets = [config.apiKey];
const model = createChatModel(config);
const T = 180_000;

async function capture(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(() => undefined, (e: unknown) => e);
}

describe('Devscale Gateway via @anvia/openai (chat API)', () => {
  it('uses the exact configured model ID', () => {
    expect(config.modelId).toBe('deepseek-v4.1-flash');
    expect(config.baseUrl).toBe('https://gateway.devscale.id/v1');
  });

  it('performs a real chat completion through the adapter', { timeout: T }, async () => {
    const res = await generateCompletion({
      model,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with exactly: OK' }] }],
      maxTokens: 500,
    });
    const text = res.text;
    console.info('[completion]', JSON.stringify({ finishReason: res.finishReason, text, usage: res.usage }));
    expect(text.trim()).toContain('OK');
    expect(res.usage.outputTokens).toBeGreaterThan(0);
  });

  it('runs a plain-text Anvia Agent', { timeout: T }, async () => {
    const agent = new Agent({ id: 'plain-probe', model, instructions: 'Answer in one short sentence.', maxTokens: 800 });
    const outcome = await agent.generate({ prompt: 'Name one fictional football club in five words or fewer.' });
    expect(outcome.type).toBe('response');
    if (outcome.type === 'response') expect(outcome.output.length).toBeGreaterThan(0);
  });
});

describe('synthetic scouting Agent', () => {
  it('returns Zod-validated structured output grounded in the synthetic data', { timeout: T }, async () => {
    const prepared = prepareBrief(ScoutingRequestSchema.parse(syntheticRequest));
    const outcome = await createScoutingAgent(model).generate({ prompt: buildAgentPrompt(prepared) });
    expect(outcome.type).toBe('response');
    if (outcome.type !== 'response') return;
    console.info('[agent]', JSON.stringify({ output: outcome.output, usage: outcome.usage, runId: outcome.runId }));
    expect(outcome.output.verdict).toBe('candidates_found');
    expect(() => assertEvidenceMatches(prepared, outcome.output)).not.toThrow();
  });

  it('rejects schema-valid provider JSON that fails a local-only Zod rule', { timeout: T }, async () => {
    // The refinement cannot be expressed in JSON Schema, so it is never sent to the provider:
    // the gateway may enforce the shape, but only local Zod validation can reject this.
    const agent = new Agent({
      id: 'local-rule-probe',
      model,
      instructions: 'Answer the question.',
      outputSchema: z.object({ answer: z.string() }).refine((v) => v.answer === 'WS-LOCAL-ONLY-7f3a'),
      maxTokens: 800,
      retries: { maxAttempts: 2, shouldRetry: ({ error }) => error instanceof AgentStructuredOutputError },
    });
    const error = toSpikeError(await capture(agent.generate({ prompt: 'Name a fictional football stadium.' })), secrets);
    console.info('[local-rule]', error.name, error.message);
    expect(error).toBeInstanceOf(InvalidAgentOutputError);
    expect((error as InvalidAgentOutputError).phase).toBe('schema');
  });

  it('rejects a truncated real response (finish_reason=length)', { timeout: T }, async () => {
    const prepared = prepareBrief(ScoutingRequestSchema.parse(syntheticRequest));
    const error = toSpikeError(
      await capture(createScoutingAgent(model, { maxTokens: 16 }).generate({ prompt: buildAgentPrompt(prepared) })),
      secrets,
    );
    console.info('[truncated]', error.name, error.message);
    expect(error).toBeInstanceOf(InvalidAgentOutputError);
    expect((error as InvalidAgentOutputError).phase).toBe('truncated');
  });
});

describe('synthetic scouting Pipeline', () => {
  it('runs input → preprocess → agent → validate with typed, validated output', { timeout: T }, async () => {
    const events: string[] = [];
    const result = await createScoutingPipeline(createScoutingAgent(model)).run({
      input: syntheticRequest,
      observer: { onEvent: (e) => { events.push(`${e.type}:${e.node.id}`); } },
    });
    console.info('[pipeline]', JSON.stringify({ runId: result.runId, output: result.output, events }));
    expect(ScoutingResultSchema.parse(result.output)).toEqual(result.output);
    expect(result.output.assessment.verdict).toBe('candidates_found');
    const order = ['stage_completed:preprocess', 'stage_completed:scouting-agent', 'stage_completed:validate-output'];
    expect(order.map((e) => events.indexOf(e)).every((i, idx, arr) => i >= 0 && (idx === 0 || i > arr[idx - 1]!))).toBe(true);
  });

  it('propagates provider auth failure (HTTP 401) as ProviderError without leaking the key', { timeout: T }, async () => {
    const badKey = 'invalid-key-wonderscout-spike';
    const badModel = createChatModel({ ...config, apiKey: badKey });
    const events: string[] = [];
    const raw = await capture(
      createScoutingPipeline(createScoutingAgent(badModel)).run({
        input: syntheticRequest,
        observer: { onEvent: (e) => { events.push(`${e.type}:${e.node.id}`); } },
      }),
    );
    const error = toSpikeError(raw, [badKey, config.apiKey]);
    console.info('[401]', error.name, error.message, events.filter((e) => e.startsWith('stage_failed')));
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).statusCode).toBe(401);
    expect(error.message).not.toContain(badKey);
    expect(error.message).not.toContain(config.apiKey);
    expect(events).toContain('stage_failed:scouting-agent');
    expect(events).not.toContain('stage_started:validate-output');
  });

  it('propagates unknown model (HTTP 400) without substituting another model', { timeout: T }, async () => {
    const wrong = createChatModel({ ...config, modelId: 'deepseek-v4.1-flash-does-not-exist' });
    const error = toSpikeError(await capture(createScoutingPipeline(createScoutingAgent(wrong)).run({ input: syntheticRequest })), secrets);
    console.info('[400]', error.name, error.message);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).statusCode).toBe(400);
  });
});
