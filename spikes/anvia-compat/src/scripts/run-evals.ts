/**
 * Runs the tool-evidence Eval against the real Devscale model + local MCP server.
 * Exit code: 0 all pass, 1 failed metric, 2 invalid. `--inject-wrong-expected` makes one
 * expectation deliberately wrong to prove failures are detected.
 */
import { runEvalCli } from '@anvia/core/evals';
import { toolEvidenceCases, toolEvidenceMetrics, toolEvidenceTarget, toolEvidenceUsage } from '../evals/tool-evidence-eval.js';
import { createChatModel, loadModelConfig } from '../model-config.js';
import { redact } from '../redact.js';

const inject = process.argv.includes('--inject-wrong-expected');
const config = loadModelConfig();

await runEvalCli({
  name: inject ? 'tool-evidence (INJECTED WRONG EXPECTED)' : 'tool-evidence',
  cases: toolEvidenceCases(inject),
  target: toolEvidenceTarget(createChatModel(config)),
  metrics: toolEvidenceMetrics,
  targetUsage: toolEvidenceUsage,
  caseTimeoutMs: 200_000,
  format: 'pretty',
  exitCode: true,
  redact: (value) => (typeof value === 'string' ? redact(value, [config.apiKey]) : value),
});
