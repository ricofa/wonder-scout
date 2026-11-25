import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { InvocationLogEntry } from '../../src/mcp/server.js';

/** Fresh per-test invocation log + unpredictable verification ID. */
export function mcpTestContext() {
  const dir = mkdtempSync(join(tmpdir(), 'wonderscout-mcp-'));
  return { verificationId: `VERIFY-${randomUUID()}`, invocationLogPath: join(dir, 'invocations.jsonl') };
}

export function readInvocationLog(path: string): InvocationLogEntry[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as InvocationLogEntry);
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return predicate();
}
