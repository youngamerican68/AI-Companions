import { getEnv } from '@/lib/env';
import { LLMProvider } from './types';
import { OpenAICompatibleProvider } from './provider.openai';

export * from './types';
export * from './prompts';

// Singleton instance
let _provider: LLMProvider | undefined;

/**
 * Get the configured LLM provider instance
 */
export function getLLMProvider(): LLMProvider {
  if (!_provider) {
    _provider = createLLMProvider();
  }
  return _provider;
}

/**
 * Create a new LLM provider based on configuration
 */
function createLLMProvider(): LLMProvider {
  const env = getEnv();

  switch (env.LLM_PROVIDER) {
    case 'openai':
      if (!env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required for OpenAI provider');
      }
      return new OpenAICompatibleProvider({
        apiKey: env.OPENAI_API_KEY,
        baseUrl: env.OPENAI_BASE_URL,
        model: env.OPENAI_MODEL,
      });

    case 'anthropic':
      // Anthropic stub - would need to implement provider.anthropic.ts
      throw new Error('Anthropic provider not yet implemented');

    default:
      throw new Error(`Unknown LLM provider: ${env.LLM_PROVIDER}`);
  }
}

/**
 * Reset the provider instance (useful for testing)
 */
export function resetLLMProvider(): void {
  _provider = undefined;
}
