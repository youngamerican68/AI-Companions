import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Redis (optional - enables queue mode)
  REDIS_URL: z.string().url().optional(),

  // LLM Provider
  LLM_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  // Anthropic (optional)
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  // Security
  INGEST_SECRET: z.string().min(16),

  // Clustering Configuration
  CLUSTER_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.4),
  CLUSTER_TRGM_THRESHOLD: z.coerce.number().min(0).max(1).default(0.2),
  CLUSTER_ACTIVE_DAYS: z.coerce.number().int().min(1).default(7),

  // Ranking Configuration
  RANKING_MAX_DOMAINS: z.coerce.number().int().min(1).default(6),
  RANKING_RECENCY_DECAY_HOURS: z.coerce.number().int().min(1).default(24),

  // Direct Mode Settings
  DIRECT_MODE_MAX_ITEMS: z.coerce.number().int().min(1).default(30),
  DIRECT_MODE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(55000),
  DIRECT_MODE_LLM_CONCURRENCY: z.coerce.number().int().min(1).default(3),

  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }

  // Validate LLM provider has required API key
  if (parsed.data.LLM_PROVIDER === 'openai' && !parsed.data.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER is openai');
  }

  if (parsed.data.LLM_PROVIDER === 'anthropic' && !parsed.data.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required when LLM_PROVIDER is anthropic');
  }

  return parsed.data;
}

// Lazy initialization to avoid issues during build time
let _env: Env | undefined;

export function getEnv(): Env {
  if (!_env) {
    _env = validateEnv();
  }
  return _env;
}

// Helper to check if queue mode is enabled
export function isQueueModeEnabled(): boolean {
  return !!process.env.REDIS_URL;
}

// Export env as default for convenience
export const env = new Proxy({} as Env, {
  get(_, prop: string) {
    return getEnv()[prop as keyof Env];
  },
});
