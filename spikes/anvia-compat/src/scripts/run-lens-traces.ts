/**
 * Sends one successful and one controlled-failure Pipeline run to the REAL Anvia Lens backend
 * configured by ANVIA_LENS_BASE_URL / ANVIA_LENS_PUBLIC_KEY / ANVIA_LENS_SECRET_KEY.
 * Uses the real Devscale model and the real MCP server. Prints only trace IDs and statuses.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createScoutingAgent } from '../agent.js';
import { toSpikeError } from '../errors.js';
import { withDemoMcp } from '../mcp/client.js';
import { createChatModel, loadModelConfig } from '../model-config.js';
import { createLensClient, lensObservability, type LensConnection } from '../observability.js';
import { createScoutingPipeline } from '../pipeline.js';
import type { ScoutingRequestInput } from '../schemas.js';

/** Entirely fictional players, identical to test/fixtures/synthetic-request.ts. */
const syntheticRequest: ScoutingRequestInput = {
  dataset: "synthetic",
  brief: "Find a young progressive midfielder who advances the ball and creates chances.",
  positionGroup: "MID",
  ageMin: 18,
  ageMax: 23,
  minMinutes: 450,
  players: [
    { playerId: "SYN-001", name: "Arlo Venn", ageYears: 20, positionGroup: "MID", minutes: 1800, goals: 3, assists: 6, progressivePasses: 160 },
    { playerId: "SYN-002", name: "Bastian Krell", ageYears: 22, positionGroup: "MID", minutes: 2250, goals: 5, assists: 4, progressivePasses: 120 },
    { playerId: "SYN-003", name: "Caio Mendell", ageYears: 19, positionGroup: "MID", minutes: 900, goals: 1, assists: 3, progressivePasses: 95 },
    { playerId: "SYN-004", name: "Dorian Pask", ageYears: 24, positionGroup: "MID", minutes: 2600, goals: 4, assists: 7, progressivePasses: 210 },
    { playerId: "SYN-005", name: "Emre Talvik", ageYears: 21, positionGroup: "MID", minutes: 300, goals: 0, assists: 1, progressivePasses: 30 },
    { playerId: "SYN-006", name: "Fenn Ortega", ageYears: 20, positionGroup: "FWD", minutes: 1700, goals: 9, assists: 2, progressivePasses: 40 },
  ],
};

const LensEnvSchema = z.object({
  ANVIA_LENS_BASE_URL: z.url(),
  ANVIA_LENS_PUBLIC_KEY: z.string().min(1),
  ANVIA_LENS_SECRET_KEY: z.string().min(1),
});

function loadLensConnection(source: Record<string, string | undefined> = process.env): LensConnection {
  const parsed = LensEnvSchema.safeParse(source);
  if (!parsed.success) {
    // Report only which variables are invalid, never their values.
    throw new Error(`Invalid Lens configuration: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  }
  return {
    baseUrl: parsed.data.ANVIA_LENS_BASE_URL,
    publicKey: parsed.data.ANVIA_LENS_PUBLIC_KEY,
    secretKey: parsed.data.ANVIA_LENS_SECRET_KEY,
  };
}

const config = loadModelConfig();
const connection = loadLensConnection();
const FAILURE_KEY = 'invalid-key-lens-real-run';
const lens = createLensClient(connection, [config.apiKey, connection.secretKey, connection.publicKey, FAILURE_KEY]);
const obs = lensObservability(lens);

async function runPipeline(apiKey: string) {
  const verificationId = `VERIFY-${randomUUID()}`;
  const model = createChatModel({ ...config, apiKey });
  const started = performance.now();
  try {
    const result = await withDemoMcp({ verificationId }, (mcp) =>
      createScoutingPipeline(createScoutingAgent(model, { mcpServers: mcp.servers, observability: obs.agent }), {
        observability: obs.pipeline,
      }).run({ input: { ...syntheticRequest, lookupPlayerIds: ['SYN-101'] } }),
    );
    return {
      ok: true as const,
      runId: result.runId,
      trace: result.trace,
      verificationId,
      ms: Math.round(performance.now() - started),
      verdict: result.output.assessment.verdict,
      candidates: result.output.assessment.candidates.map((c) => c.playerId),
    };
  } catch (error) {
    const e = toSpikeError(error, [config.apiKey, connection.secretKey, FAILURE_KEY]);
    return { ok: false as const, error: `${e.name}: ${e.message}`, verificationId, ms: Math.round(performance.now() - started) };
  }
}

const summary: Record<string, unknown> = { lensBaseUrl: connection.baseUrl, model: config.modelId };
try {
  summary.success = await runPipeline(config.apiKey);
  summary.failure = await runPipeline(FAILURE_KEY);
} finally {
  // Flush queued spans and logs before closing, so nothing is dropped at shutdown.
  try {
    await lens.flush();
    summary.flush = 'ok';
  } catch (error) {
    summary.flush = `error: ${toSpikeError(error, [config.apiKey, connection.secretKey]).message}`;
    process.exitCode = 1;
  }
  try {
    await lens.close();
    summary.close = 'ok';
  } catch (error) {
    summary.close = `error: ${toSpikeError(error, [config.apiKey, connection.secretKey]).message}`;
    process.exitCode = 1;
  }
}
console.log(JSON.stringify(summary, null, 2));
