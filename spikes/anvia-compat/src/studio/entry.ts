/**
 * DEVELOPMENT-ONLY Anvia Studio entry. Binds to 127.0.0.1 only; the Devscale key stays in this
 * server process (never sent to the browser). Start with `pnpm studio` and open
 * http://127.0.0.1:4021/ui/playground
 */
import { randomUUID } from 'node:crypto';
import { McpClientGroup } from '@anvia/mcp';
import { createDemoMcpClient } from '../mcp/client.js';
import { createChatModel, loadModelConfig } from '../model-config.js';
import { createStudioSession } from './session.js';

const config = loadModelConfig();
const group = await McpClientGroup.connect({
  clients: [createDemoMcpClient({ verificationId: `VERIFY-studio-${randomUUID()}` })],
});

try {
  const { studio } = createStudioSession(createChatModel(config), group.servers);
  await studio.serve({
    hostname: '127.0.0.1',
    port: 4021,
    onShutdown: () => group.close(),
  });
} catch (error) {
  await group.close();
  console.error(`Studio failed to start: ${error instanceof Error ? error.name : 'unknown error'}`);
  process.exitCode = 1;
}
