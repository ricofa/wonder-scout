import { appendFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { DEMO_PLAYERS, FAILING_PLAYER_ID, SLOW_PLAYER_ID } from './fixtures.js';

export const DEMO_TOOL_NAME = 'get_demo_player_stats';
export const DEMO_SERVER_NAME = 'wonderscout-demo-mcp';

export type DemoServerOptions = {
  /** Execution-time value returned in every successful result; never part of the model prompt. */
  verificationId: string;
  /** Optional JSONL file recording every invocation (independent evidence). */
  invocationLogPath?: string | undefined;
  slowDelayMs?: number | undefined;
};

export type InvocationLogEntry = {
  at: string;
  pid: number;
  event: 'started' | 'call' | 'shutdown';
  playerId?: string;
  outcome?: 'ok' | 'unknown_player' | 'internal_error' | 'cancelled' | 'slow_completed';
};

export function logInvocation(path: string | undefined, entry: Omit<InvocationLogEntry, 'at' | 'pid'>): void {
  if (path === undefined) return;
  appendFileSync(path, `${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, ...entry })}\n`);
}

const InputSchema = z.object({
  playerId: z.string().regex(/^SYN-\d{3}$/, 'playerId must be a synthetic ID like SYN-101'),
});

/** One read-only tool over fixed fictional data. */
export function createDemoMcpServer(options: DemoServerOptions): McpServer {
  const server = new McpServer({ name: DEMO_SERVER_NAME, version: '0.1.0' }, { capabilities: { tools: {} } });
  const log = (entry: Omit<InvocationLogEntry, 'at' | 'pid'>) => logInvocation(options.invocationLogPath, entry);

  server.registerTool(
    DEMO_TOOL_NAME,
    {
      title: 'Get demo player stats',
      description:
        'Returns per-90 statistics for one FICTIONAL player by synthetic ID (e.g. SYN-101). ' +
        'The result includes a verificationId that must be cited as evidence.',
      inputSchema: InputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ playerId }, ctx) => {
      if (playerId === FAILING_PLAYER_ID) {
        log({ event: 'call', playerId, outcome: 'internal_error' });
        throw new Error('Simulated internal failure in demo data store');
      }
      if (playerId === SLOW_PLAYER_ID) {
        const signal = ctx.mcpReq.signal;
        const cancelled = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), options.slowDelayMs ?? 30_000);
          signal.addEventListener('abort', () => { clearTimeout(timer); resolve(true); }, { once: true });
        });
        log({ event: 'call', playerId, outcome: cancelled ? 'cancelled' : 'slow_completed' });
        return { content: [{ type: 'text', text: cancelled ? 'cancelled' : 'slow result' }] };
      }
      const player = DEMO_PLAYERS[playerId];
      if (player === undefined) {
        log({ event: 'call', playerId, outcome: 'unknown_player' });
        return { isError: true, content: [{ type: 'text', text: `Unknown player ID: ${playerId}` }] };
      }
      log({ event: 'call', playerId, outcome: 'ok' });
      const result = { dataset: 'synthetic', verificationId: options.verificationId, player };
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    },
  );
  return server;
}
