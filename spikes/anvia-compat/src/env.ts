import { z } from 'zod';

const flag = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');

/**
 * Minimal spike environment contract (TDD §11.2). Model/Lens values stay
 * optional until the compatibility spike selects a provider.
 */
export const SpikeEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MODEL_PROVIDER: z.string().min(1).optional(),
  MODEL_ID: z.string().min(1).optional(),
  MODEL_API_KEY: z.string().min(1).optional(),
  ALLOW_REAL_DATA_SCORING: flag,
  ALLOW_PUBLIC_DATA_DISPLAY: flag,
});

export type SpikeEnv = z.infer<typeof SpikeEnvSchema>;

/** Empty strings (as in .env.example) are treated as unset. */
export function parseSpikeEnv(source: Record<string, string | undefined>): SpikeEnv {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );
  return SpikeEnvSchema.parse(cleaned);
}
