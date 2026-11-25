/** MCP producer/consumer over real stdio (child process). No model involved. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { McpClientGroup } from '@anvia/mcp';
import { createDemoMcpClient, withDemoMcp } from '../src/mcp/client.js';
import { DEMO_TOOL_NAME } from '../src/mcp/server.js';
import { isProcessAlive, mcpTestContext, readInvocationLog, waitFor } from './helpers/mcp-test-utils.js';

const T = 20_000;

async function callText(group: McpClientGroup, args: unknown): Promise<string> {
  const out = (await group.servers[0]!.tools[0]!.call(args)) as { content: { type: string; text?: string }[] };
  return out.content.map((p) => p.text ?? '').join('');
}

describe('demo MCP server over stdio', () => {
  it('initializes, discovers exactly one read-only tool, and serves the fixture', { timeout: T }, async () => {
    const ctx = mcpTestContext();
    await withDemoMcp(ctx, async (group) => {
      const server = group.servers[0]!;
      expect(server.serverInfo).toMatchObject({ name: 'wonderscout-demo-mcp', version: '0.1.0' });
      expect(server.tools.map((t) => t.name)).toEqual([DEMO_TOOL_NAME]);
      const def = await server.tools[0]!.definition('');
      expect(def.parameters).toMatchObject({ type: 'object', required: ['playerId'], properties: { playerId: { type: 'string', pattern: '^SYN-\\d{3}$' } } });

      const result = JSON.parse(await callText(group, { playerId: 'SYN-101' }));
      expect(result).toMatchObject({ dataset: 'synthetic', verificationId: ctx.verificationId, player: { playerId: 'SYN-101', metrics: { progressivePassesPer90: 7.65 } } });
    });
    expect(readInvocationLog(ctx.invocationLogPath).filter((e) => e.event === 'call')).toEqual([
      expect.objectContaining({ playerId: 'SYN-101', outcome: 'ok' }),
    ]);
  });

  it.each([
    ['malformed ID', { playerId: 'not-an-id' }, /Input validation error.*synthetic ID/],
    ['missing field', { wrong: 1 }, /Input validation error.*playerId/],
    ['unknown player', { playerId: 'SYN-999' }, /Unknown player ID: SYN-999/],
    ['simulated internal failure', { playerId: 'SYN-500' }, /Simulated internal failure/],
  ])('rejects %s with a tool error', { timeout: T }, async (_label, args, message) => {
    const ctx = mcpTestContext();
    await withDemoMcp(ctx, async (group) => {
      await expect(group.servers[0]!.tools[0]!.call(args)).rejects.toThrow(message);
      // Server keeps serving after an error.
      expect(JSON.parse(await callText(group, { playerId: 'SYN-102' })).player.playerId).toBe('SYN-102');
    });
  });

  it('client rejects non-object arguments before sending', { timeout: T }, async () => {
    await withDemoMcp(mcpTestContext(), async (group) => {
      expect(() => group.servers[0]!.tools[0]!.parseInput!(['SYN-101'])).toThrow(/strict JSON object/);
    });
  });

  it.runIf(process.platform === 'linux')('does not pass model credentials to the MCP child process', { timeout: T }, async () => {
    const ctx = mcpTestContext();
    process.env.OPENAI_API_KEY_CANARY_TEST = 'canary-should-not-leak';
    try {
      await withDemoMcp(ctx, async () => {
        const pid = readInvocationLog(ctx.invocationLogPath).filter((e) => e.event === 'started').at(-1)!.pid;
        const names = readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').map((kv) => kv.split('=')[0]);
        expect(names.filter((n) => n?.startsWith('OPENAI'))).toEqual([]);
        expect(names).toContain('MCP_VERIFICATION_ID');
      });
    } finally {
      delete process.env.OPENAI_API_KEY_CANARY_TEST;
    }
  });

  it('disconnects cleanly and the server process exits', { timeout: T }, async () => {
    const ctx = mcpTestContext();
    const group = await McpClientGroup.connect({ clients: [createDemoMcpClient(ctx)] });
    // Pinned protocol 2026-07-28: the SDK probes `server/discover` on a short-lived sibling
    // process, then starts the long-lived connection process.
    const starts = readInvocationLog(ctx.invocationLogPath).filter((e) => e.event === 'started');
    expect(starts).toHaveLength(2);
    const pids = starts.map((e) => e.pid);
    expect(isProcessAlive(pids[1]!)).toBe(true);
    await group.close();
    expect(await waitFor(() => pids.every((pid) => !isProcessAlive(pid)))).toBe(true);
    const shutdowns = readInvocationLog(ctx.invocationLogPath).filter((e) => e.event === 'shutdown').map((e) => e.pid);
    expect(shutdowns.sort()).toEqual([...pids].sort());
  });
});
