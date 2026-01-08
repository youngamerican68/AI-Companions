import {
  LLMProvider,
  LLMProviderConfig,
  LLMResponse,
  NormalizeOptions,
  NormalizeResultSchema,
  NORMALIZE_JSON_SCHEMA,
  LLMError,
  LLMRateLimitError,
  LLMValidationError,
} from './types';
import {
  NORMALIZE_SYSTEM_PROMPT,
  buildNormalizePrompt,
  buildNormalizeFallbackPrompt,
  extractJsonFromResponse,
  PROMPT_VERSION,
} from './prompts';
import { truncateText } from '@/lib/hash';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIResponseChoice {
  message: {
    content: string | null;
    function_call?: {
      name: string;
      arguments: string;
    };
  };
  finish_reason: string;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIResponseChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const DEFAULT_CONFIG = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  maxRetries: 3,
  timeout: 30000,
};

const MAX_INPUT_LENGTH = 15000; // Characters to send to LLM

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = 'openai';

  private readonly config: Required<LLMProviderConfig>;

  constructor(config: LLMProviderConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      baseUrl: config.baseUrl || DEFAULT_CONFIG.baseUrl,
      model: config.model || DEFAULT_CONFIG.model,
      maxRetries: config.maxRetries ?? DEFAULT_CONFIG.maxRetries,
      timeout: config.timeout ?? DEFAULT_CONFIG.timeout,
    };
  }

  async normalize(text: string, options: NormalizeOptions): Promise<LLMResponse> {
    // Truncate input if too long
    const truncatedText = truncateText(text, MAX_INPUT_LENGTH);
    const userPrompt = buildNormalizePrompt(truncatedText, options);

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await this.callApi([
          { role: 'system', content: NORMALIZE_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ]);

        const rawContent = response.choices[0]?.message?.content || '';
        const jsonStr = extractJsonFromResponse(rawContent);

        // Parse and validate the response
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          throw new LLMError(
            `Invalid JSON in response: ${rawContent.slice(0, 200)}`,
            this.name
          );
        }

        const validated = NormalizeResultSchema.safeParse(parsed);
        if (!validated.success) {
          throw new LLMValidationError(this.name, rawContent, validated.error);
        }

        return {
          result: validated.data,
          rawResponse: truncateText(rawContent, 20000), // Bound to 20KB
          model: response.model || this.config.model,
          promptVersion: PROMPT_VERSION,
        };
      } catch (error) {
        lastError = error as Error;

        if (error instanceof LLMRateLimitError) {
          // Wait and retry on rate limit
          const waitTime = error.retryAfter || (attempt + 1) * 1000;
          await this.sleep(waitTime);
          continue;
        }

        if (error instanceof LLMValidationError && attempt < this.config.maxRetries - 1) {
          // Retry with fallback prompt on validation errors
          const fallbackPrompt = buildNormalizeFallbackPrompt(truncatedText, options);
          try {
            const response = await this.callApi([
              { role: 'system', content: NORMALIZE_SYSTEM_PROMPT },
              { role: 'user', content: fallbackPrompt },
            ]);

            const rawContent = response.choices[0]?.message?.content || '';
            const jsonStr = extractJsonFromResponse(rawContent);

            const parsed = JSON.parse(jsonStr);
            const validated = NormalizeResultSchema.safeParse(parsed);

            if (validated.success) {
              return {
                result: validated.data,
                rawResponse: truncateText(rawContent, 20000),
                model: response.model || this.config.model,
                promptVersion: PROMPT_VERSION,
              };
            }
          } catch {
            // Continue to retry
          }
        }

        // Don't retry on other errors
        if (!(error instanceof LLMRateLimitError)) {
          throw error;
        }
      }
    }

    throw lastError || new LLMError('Max retries exceeded', this.name);
  }

  private async callApi(messages: OpenAIMessage[]): Promise<OpenAIResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.3, // Lower temperature for more consistent outputs
          max_tokens: 1000,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
          throw new LLMRateLimitError(this.name, retryAfter * 1000);
        }

        const errorBody = await response.text();
        throw new LLMError(
          `API error ${response.status}: ${errorBody.slice(0, 200)}`,
          this.name
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }

      if ((error as Error).name === 'AbortError') {
        throw new LLMError('Request timeout', this.name, error);
      }

      throw new LLMError('Network error', this.name, error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
