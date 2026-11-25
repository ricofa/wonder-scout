import { describe, expect, it } from 'vitest';
import type { CompletionModel } from '@anvia/core';
import { createStudioSession, opaqueModelForStudio } from '../src/studio/session.js';
import { createChatModel } from '../src/model-config.js';
import { SCOUTING_AGENT_ID } from '../src/agent.js';
import { SCOUTING_PIPELINE_ID } from '../src/pipeline.js';

// Fake key only: the registration test makes no network call.
const FAKE_KEY = 'sk-studio-registration-test-key-000000';

describe('Studio registration (offline)', () => {
  it('registers the existing Agent and Pipeline and never serializes the model key', () => {
    const model = createChatModel({ apiKey: FAKE_KEY, baseUrl: 'https://gateway.devscale.id/v1', modelId: 'deepseek-v4.1-flash' });
    const { studio } = createStudioSession(model, []);
    const config = studio.config();
    const serialized = JSON.stringify(config);

    expect(config.capabilities.agents).toBeDefined();
    expect(config.capabilities.pipelines).toBeDefined();
    expect(serialized).toContain(SCOUTING_AGENT_ID);
    expect(serialized).toContain(SCOUTING_PIPELINE_ID);
    expect(serialized).not.toContain(FAKE_KEY);
  });

  it('keeps the model key out of every browser-facing HTTP endpoint', async () => {
    const model = createChatModel({ apiKey: FAKE_KEY, baseUrl: 'https://gateway.devscale.id/v1', modelId: 'deepseek-v4.1-flash' });
    const { studio } = createStudioSession(model, []);
    const paths = [
      '/health',
      '/status',
      '/config',
      '/agents',
      `/agents/${SCOUTING_AGENT_ID}`,
      `/agents/${SCOUTING_AGENT_ID}/runtime`,
      `/agents/${SCOUTING_AGENT_ID}/models`,
      `/agents/${SCOUTING_AGENT_ID}/mcps`,
      `/agents/${SCOUTING_AGENT_ID}/tools`,
      '/pipelines',
      `/pipelines/${SCOUTING_PIPELINE_ID}`,
      '/tools',
      '/traces',
    ];
    for (const path of paths) {
      const response = await studio.fetch(new Request(`http://127.0.0.1${path}`));
      const body = await response.text();
      expect(body, path).not.toContain(FAKE_KEY);
    }
  });
});

describe('Studio streaming wrapper (offline)', () => {
  it('forwards streamCompletion from the real model so Agent.stream() can run', () => {
    const model = createChatModel({ apiKey: FAKE_KEY, baseUrl: 'https://gateway.devscale.id/v1', modelId: 'deepseek-v4.1-flash' });
    const wrapped = opaqueModelForStudio(model);
    expect(typeof wrapped.streamCompletion).toBe('function');
    expect(wrapped.capabilities.streaming).toBe(true);
    expect(JSON.stringify(wrapped)).not.toContain(FAKE_KEY);
  });

  it('does not claim streamCompletion for a non-streaming model', () => {
    const nonStreaming = { provider: 'fake', modelId: 'no-stream', capabilities: {}, completion: async () => ({}) } as unknown as CompletionModel;
    expect(opaqueModelForStudio(nonStreaming).streamCompletion).toBeUndefined();
  });
});
