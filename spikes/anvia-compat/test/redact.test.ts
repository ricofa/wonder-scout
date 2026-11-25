import { expect, it } from 'vitest';
import { redact } from '../src/redact.js';

it('redacts configured secrets and token shapes', () => {
  const out = redact('key=abcdef123456 auth: Bearer xyz.987654321 other sk-live_ABCDEFGH', ['abcdef123456']);
  expect(out).toBe('key=[REDACTED] auth: Bearer [REDACTED] other sk-[REDACTED]');
});
