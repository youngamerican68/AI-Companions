import { z } from 'zod';
import { Category } from '@prisma/client';

// =============================================================================
// Zod Schemas for LLM Output Validation
// =============================================================================

export const EntitiesSchema = z.object({
  platforms: z.array(z.string()).default([]),
  companies: z.array(z.string()).default([]),
  people: z.array(z.string()).default([]),
  topics: z.array(z.string()).default([]),
});

export const NormalizeResultSchema = z.object({
  summary: z.string().max(500),
  suggestedHeadline: z.string().max(120),
  categories: z.array(z.nativeEnum(Category)).min(1),
  entities: EntitiesSchema,
  confidence: z.number().min(0).max(1),
});

export type Entities = z.infer<typeof EntitiesSchema>;
export type NormalizeResult = z.infer<typeof NormalizeResultSchema>;

// =============================================================================
// LLM Provider Interface
// =============================================================================

export interface NormalizeOptions {
  title?: string;
  url?: string;
  sourceName?: string;
  publishedAt?: Date | null;
}

export interface LLMProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface LLMResponse {
  result: NormalizeResult;
  rawResponse: string;
  model: string;
  promptVersion: string;
}

export interface LLMProvider {
  readonly name: string;

  /**
   * Normalize raw signal text into structured data
   */
  normalize(text: string, options: NormalizeOptions): Promise<LLMResponse>;
}

// =============================================================================
// Error Types
// =============================================================================

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export class LLMRateLimitError extends LLMError {
  constructor(provider: string, public readonly retryAfter?: number) {
    super('Rate limit exceeded', provider);
    this.name = 'LLMRateLimitError';
  }
}

export class LLMValidationError extends LLMError {
  constructor(
    provider: string,
    public readonly rawResponse: string,
    public readonly validationErrors: z.ZodError
  ) {
    super('Invalid LLM response format', provider);
    this.name = 'LLMValidationError';
  }
}

// =============================================================================
// JSON Schema for LLM Prompts (OpenAI function calling format)
// =============================================================================

export const NORMALIZE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'A factual 2-3 sentence summary of the content',
      maxLength: 500,
    },
    suggestedHeadline: {
      type: 'string',
      description: 'A short, factual headline (max 120 chars)',
      maxLength: 120,
    },
    categories: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'PRODUCT_UPDATE',
          'MONETIZATION_CHANGE',
          'SAFETY_YOUTH_RISK',
          'NSFW_CONTENT_POLICY',
          'CULTURAL_TREND',
          'REGULATORY_LEGAL',
          'BUSINESS_FUNDING',
        ],
      },
      minItems: 1,
      description: 'One or more applicable categories',
    },
    entities: {
      type: 'object',
      properties: {
        platforms: {
          type: 'array',
          items: { type: 'string' },
          description:
            'AI companion platform names mentioned (e.g., replika, character-ai, nomi)',
        },
        companies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Company names mentioned',
        },
        people: {
          type: 'array',
          items: { type: 'string' },
          description: 'People names mentioned',
        },
        topics: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key topics/themes mentioned',
        },
      },
      required: ['platforms', 'companies', 'people', 'topics'],
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence score (0-1) in the classification accuracy',
    },
  },
  required: ['summary', 'suggestedHeadline', 'categories', 'entities', 'confidence'],
};
