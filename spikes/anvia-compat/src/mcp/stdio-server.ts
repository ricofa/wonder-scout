/**
 * Stdio entry point for the demo MCP producer. Launched as a child process by the consumer.
 * stdout is the protocol channel: never write logs to it.
 */
import { randomUUID } from 'node:crypto';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createDemoMcpServer, logInvocation } from './server.js';

const invocationLogPath = process.env.MCP_INVOCATION_LOG || undefined;
const slowDelayMs = Number(process.env.MCP_SLOW_DELAY_MS ?? 30_000);
const verificationId = process.env.MCP_VERIFICATION_ID || randomUUID();

logInvocation(invocationLogPath, { event: 'started' });
const handle = serveStdio(() => createDemoMcpServer({ verificationId, invocationLogPath, slowDelayMs }), {
  onerror: (error) => process.stderr.write(`[demo-mcp] ${error.message}\n`),
});

let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  logInvocation(invocationLogPath, { event: 'shutdown' });
  void handle.close().finally(() => process.exit(0));
};
process.stdin.on('end', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
