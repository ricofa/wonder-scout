import { describe, expect, expectTypeOf, it } from 'vitest';
import { ZodError } from 'zod';
import { createScoutingAgent } from '../src/agent.js';
import { toSpikeError, InvalidInputError } from '../src/errors.js';
import { createChatModel, loadModelConfig } from '../src/model-config.js';
import { createScoutingPipeline } from '../src/pipeline.js';
import type { ScoutingRequestInput, ScoutingResult } from '../src/schemas.js';
import { syntheticRequest } from './fixtures/synthetic-request.js';

// Unroutable dummy endpoint: proves invalid input is rejected before any model call.
const model = createChatModel({ apiKey: 'offline-test', baseUrl: 'http://127.0.0.1:9/v1', modelId: 'offline' });
const pipeline = createScoutingPipeline(createScoutingAgent(model));

describe('scouting pipeline input validation (offline)', () => {
  it('has typed input and output', () => {
    expectTypeOf(pipeline.run).parameter(0).toHaveProperty('input').toEqualTypeOf<ScoutingRequestInput>();
    expectTypeOf<Awaited<ReturnType<typeof pipeline.run>>['output']>().toEqualTypeOf<ScoutingResult>();
  });

  it('declares the expected stage graph', () => {
    const kinds = pipeline.graph().nodes.map((n) => `${n.kind}:${n.id}`);
    expect(kinds).toEqual(expect.arrayContaining(['step:preprocess', 'parallel:assess', 'agent:scouting-agent', 'step:validate-output']));
  });

  it.each([
    ['real (non-synthetic) dataset', { ...syntheticRequest, dataset: 'real' }],
    ['non-synthetic player id', { ...syntheticRequest, players: [{ ...syntheticRequest.players[0]!, playerId: '12345' }] }],
    ['inverted age range', { ...syntheticRequest, ageMin: 23, ageMax: 18 }],
    ['age outside 16-25', { ...syntheticRequest, ageMax: 30 }],
  ])('rejects %s before any stage runs', async (_label, input) => {
    const started: string[] = [];
    const error = await pipeline
      .run({ input: input as ScoutingRequestInput, observer: { onEvent: (e) => { if (e.type === 'stage_started') started.push(e.node.id); } } })
      .then(() => undefined, (e: unknown) => e);
    expect(error).toBeInstanceOf(ZodError);
    expect(toSpikeError(error)).toBeInstanceOf(InvalidInputError);
    expect(started).not.toContain('scouting-agent');
    expect(started).not.toContain('preprocess');
  });
});

describe('loadModelConfig', () => {
  it('names missing variables without echoing values', () => {
    expect(() => loadModelConfig({ OPENAI_API_KEY: 'sk-secretvalue123', OPENAI_BASE_URL: 'not-a-url' })).toThrow(
      /OPENAI_BASE_URL, OPENAI_MODEL_ID/,
    );
    try {
      loadModelConfig({ OPENAI_API_KEY: 'sk-secretvalue123' });
    } catch (e) {
      expect(String(e)).not.toContain('secretvalue');
    }
  });
});
