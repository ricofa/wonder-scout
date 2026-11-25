/**
 * LIVE: Studio chat through its real run endpoint, with the real Devscale model. No mocks.
 * Covers the streaming path that failed with "This completion model does not support streaming".
 */
import { describe, expect, it } from 'vitest';
import { createChatModel, loadModelConfig } from '../../src/model-config.js';
import { createStudioSession } from '../../src/studio/session.js';

const config = loadModelConfig();
const runPath = 'http://127.0.0.1/agents/synthetic-scouting-agent/runs';

function runRequest(stream: boolean): Request {
  return new Request(runPath, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'messages', stream, messages: [{ role: 'user', content: 'Say hello in one short sentence.' }] }),
  });
}

describe('Studio chat with the real model (live)', () => {
  const { studio } = createStudioSession(createChatModel(config), []);

  it('completes a non-streaming chat run with validated output', async () => {
    const res = await studio.fetch(runRequest(false));
    const body = await res.text();
    expect(res.status, body.slice(0, 200)).toBe(200);
    expect(body).not.toContain('does not support streaming');
    expect(body).not.toContain(config.apiKey);
    expect(JSON.parse(body)).toHaveProperty('runId');
  }, 120_000);

  it('streams a chat run from start to end without error events', async () => {
    const res = await studio.fetch(runRequest(true));
    const text = await res.text();
    expect(res.status, text.slice(0, 200)).toBe(200);
    const events = text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as { type: string; event?: { type: string } });
    const types = events.map((e) => (e.event ? e.event.type : e.type));
    expect(types[0]).toBe('stream_start');
    expect(types).toContain('run_start');
    expect(types).toContain('text_delta');
    expect(types).toContain('run_end');
    expect(types.at(-1)).toBe('stream_end');
    expect(types.some((t) => /error/i.test(t))).toBe(false);
    expect(text).not.toContain(config.apiKey);
  }, 120_000);
});
