import { fileURLToPath } from 'node:url';
import { McpClient, McpClientGroup } from '@anvia/mcp';

/** Built server entry. Resolves to dist/mcp/stdio-server.js from both src/mcp and dist/mcp. */
export const DEMO_SERVER_ENTRY = fileURLToPath(new URL('../../dist/mcp/stdio-server.js', import.meta.url));

export type DemoMcpClientOptions = {
  verificationId: string;
  invocationLogPath?: string | undefined;
  slowDelayMs?: number | undefined;
};

/**
 * Stdio client for the demo server. The child gets an explicit minimal env:
 * model credentials (OPENAI_*) are never passed to the MCP process.
 */
export function createDemoMcpClient(options: DemoMcpClientOptions): McpClient {
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', MCP_VERIFICATION_ID: options.verificationId };
  if (options.invocationLogPath !== undefined) env.MCP_INVOCATION_LOG = options.invocationLogPath;
  if (options.slowDelayMs !== undefined) env.MCP_SLOW_DELAY_MS = String(options.slowDelayMs);
  return new McpClient({
    name: 'demo',
    transport: { type: 'stdio', command: process.execPath, args: [DEMO_SERVER_ENTRY], env, stderr: 'pipe' },
  });
}

/** Connects, runs `fn`, and always closes the connection (which shuts the child process down). */
export async function withDemoMcp<T>(
  options: DemoMcpClientOptions & { abortSignal?: AbortSignal },
  fn: (group: McpClientGroup) => Promise<T>,
): Promise<T> {
  const connectOptions = options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal };
  const group = await McpClientGroup.connect({ clients: [createDemoMcpClient(options)], ...connectOptions });
  try {
    return await fn(group);
  } finally {
    await group.close();
  }
}
