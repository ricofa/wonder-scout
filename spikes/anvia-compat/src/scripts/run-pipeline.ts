/** Runs the synthetic scouting pipeline once against the configured gateway and prints sanitized output. */
import { createScoutingAgent } from '../agent.js';
import { toSpikeError } from '../errors.js';
import { createChatModel, loadModelConfig } from '../model-config.js';
import { createScoutingPipeline } from '../pipeline.js';
import type { ScoutingRequestInput } from '../schemas.js';

const request: ScoutingRequestInput = {
  dataset: 'synthetic',
  brief: 'Find a young progressive midfielder who advances the ball and creates chances.',
  positionGroup: 'MID',
  players: [
    { playerId: 'SYN-001', name: 'Arlo Venn', ageYears: 20, positionGroup: 'MID', minutes: 1800, goals: 3, assists: 6, progressivePasses: 160 },
    { playerId: 'SYN-002', name: 'Bastian Krell', ageYears: 22, positionGroup: 'MID', minutes: 2250, goals: 5, assists: 4, progressivePasses: 120 },
    { playerId: 'SYN-004', name: 'Dorian Pask', ageYears: 24, positionGroup: 'MID', minutes: 2600, goals: 4, assists: 7, progressivePasses: 210 },
  ],
};

const config = loadModelConfig();
const started = performance.now();
try {
  const result = await createScoutingPipeline(createScoutingAgent(createChatModel(config))).run({ input: request });
  console.log(JSON.stringify({ model: config.modelId, runId: result.runId, ms: Math.round(performance.now() - started), output: result.output }, null, 2));
} catch (error) {
  const e = toSpikeError(error, [config.apiKey]);
  console.error(`${e.name}: ${e.message}`);
  process.exitCode = 1;
}
