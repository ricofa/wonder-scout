import { OpenAIClient } from '@anvia/openai';
import { z } from 'zod';

/** Devscale Gateway connection (OpenAI-compatible). Values come only from the environment. */
export const ModelConfigSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_BASE_URL: z.url(),
  OPENAI_MODEL_ID: z.string().min(1, 'OPENAI_MODEL_ID is required'),
});

export type ModelConfig = {
  apiKey: string;
  baseUrl: string;
  modelId: string;
};

export function loadModelConfig(source: Record<string, string | undefined> = process.env): ModelConfig {
  const parsed = ModelConfigSchema.safeParse(source);
  if (!parsed.success) {
    // Report only which variables are invalid — never their values.
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid model configuration: ${fields}`);
  }
  const env = parsed.data;
  return { apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL, modelId: env.OPENAI_MODEL_ID };
}

/** Anvia chat-completions model handle for the configured gateway (no silent model substitution). */
export function createChatModel(config: ModelConfig) {
  const client = new OpenAIClient({ apiKey: config.apiKey, baseUrl: config.baseUrl });
  return client.completionModel({ modelId: config.modelId, api: 'chat' });
}

export type ChatModel = ReturnType<typeof createChatModel>;
