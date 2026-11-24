import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { parseSpikeEnv } from '../src/env.js';

describe('parseSpikeEnv', () => {
  it('defaults data gates to false with empty placeholders', () => {
    const env = parseSpikeEnv({ MODEL_PROVIDER: '', MODEL_API_KEY: '' });
    expect(env).toEqual({
      NODE_ENV: 'development',
      ALLOW_REAL_DATA_SCORING: false,
      ALLOW_PUBLIC_DATA_DISPLAY: false,
    });
  });

  it('parses explicit flag values', () => {
    const env = parseSpikeEnv({ NODE_ENV: 'test', ALLOW_REAL_DATA_SCORING: 'true' });
    expect(env.NODE_ENV).toBe('test');
    expect(env.ALLOW_REAL_DATA_SCORING).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(() => parseSpikeEnv({ ALLOW_PUBLIC_DATA_DISPLAY: 'yes' })).toThrow(ZodError);
  });
});
