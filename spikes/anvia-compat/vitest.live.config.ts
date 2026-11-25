import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Load the repo-root .env (gitignored). Existing shell variables take precedence.
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/live/**/*.live.test.ts'],
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
