import { DEFAULT_PATTERNS, LensClient } from '@anvia/lens';

export const LENS_OBSERVER = 'lens' as const;

export type LensConnection = { baseUrl: string; publicKey: string; secretKey: string };

/** Exact-value redaction for known secrets, on top of Lens's default patterns (sk-, bearer, JWT, email…). */
function secretPatterns(secrets: readonly string[]) {
  return secrets
    .filter((s) => s.length >= 6)
    .map((s, i) => ({ name: `configured-secret-${i}`, regex: new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') }));
}

/**
 * Lens client in safe capture mode (no prompt/response bodies) with redaction of inputs,
 * outputs, errors and metadata. `secrets` are redacted verbatim wherever they appear.
 */
export function createLensClient(connection: LensConnection, secrets: readonly string[] = []): LensClient {
  return new LensClient({
    ...connection,
    serviceName: 'wonderscout-anvia-compat-spike',
    environment: 'spike',
    captureMode: 'safe',
    redactInputs: true,
    redactOutputs: true,
    redactErrors: true,
    redactMetadata: true,
    redaction: { patterns: [...DEFAULT_PATTERNS, ...secretPatterns(secrets)], replacement: '[REDACTED]' },
  });
}

/** Same primary observer name on Agent and Pipeline so the Agent run nests in the Pipeline trace. */
export function lensObservability(lens: LensClient) {
  return {
    agent: { observers: { [LENS_OBSERVER]: lens.observer() }, primaryTrace: LENS_OBSERVER },
    pipeline: { observers: { [LENS_OBSERVER]: lens.pipelineObserver() }, primaryTrace: LENS_OBSERVER },
  };
}
