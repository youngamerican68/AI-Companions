import { describe, it, expect, vi, beforeAll } from 'vitest';
import { z } from 'zod';

// Mock Prisma Category enum before importing types
vi.mock('@prisma/client', () => ({
  Category: {
    PRODUCT_UPDATE: 'PRODUCT_UPDATE',
    MONETIZATION_CHANGE: 'MONETIZATION_CHANGE',
    SAFETY_YOUTH_RISK: 'SAFETY_YOUTH_RISK',
    NSFW_CONTENT_POLICY: 'NSFW_CONTENT_POLICY',
    CULTURAL_TREND: 'CULTURAL_TREND',
    REGULATORY_LEGAL: 'REGULATORY_LEGAL',
    BUSINESS_FUNDING: 'BUSINESS_FUNDING',
  },
}));

// Import after mock
import { NormalizeResultSchema, EntitiesSchema } from '@/lib/llm/types';

describe('LLM Response Parser', () => {
  describe('NormalizeResultSchema', () => {
    it('should validate a complete valid response', () => {
      const validResponse = {
        summary: 'Replika announced a new feature allowing users to customize their AI companion appearance.',
        suggestedHeadline: 'Replika Launches Avatar Customization',
        categories: ['PRODUCT_UPDATE'],
        entities: {
          platforms: ['replika'],
          companies: ['Luka Inc'],
          people: [],
          topics: ['customization', 'avatars'],
        },
        confidence: 0.95,
      };

      const result = NormalizeResultSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.summary).toBe(validResponse.summary);
        expect(result.data.categories).toContain('PRODUCT_UPDATE');
        expect(result.data.confidence).toBe(0.95);
      }
    });

    it('should reject response with missing required fields', () => {
      const incompleteResponse = {
        summary: 'A summary',
        // missing suggestedHeadline, categories, entities, confidence
      };

      const result = NormalizeResultSchema.safeParse(incompleteResponse);
      expect(result.success).toBe(false);
    });

    it('should reject response with invalid category', () => {
      const invalidCategory = {
        summary: 'A summary',
        suggestedHeadline: 'A headline',
        categories: ['INVALID_CATEGORY'],
        entities: {
          platforms: [],
          companies: [],
          people: [],
          topics: [],
        },
        confidence: 0.5,
      };

      const result = NormalizeResultSchema.safeParse(invalidCategory);
      expect(result.success).toBe(false);
    });

    it('should require at least one category', () => {
      const emptyCategories = {
        summary: 'A summary',
        suggestedHeadline: 'A headline',
        categories: [],
        entities: {
          platforms: [],
          companies: [],
          people: [],
          topics: [],
        },
        confidence: 0.5,
      };

      const result = NormalizeResultSchema.safeParse(emptyCategories);
      expect(result.success).toBe(false);
    });

    it('should accept multiple valid categories', () => {
      const multiCategory = {
        summary: 'Regulatory action on youth safety',
        suggestedHeadline: 'FTC Investigates AI Companion Apps',
        categories: ['REGULATORY_LEGAL', 'SAFETY_YOUTH_RISK'],
        entities: {
          platforms: ['replika', 'character-ai'],
          companies: ['FTC'],
          people: [],
          topics: ['regulation', 'youth safety'],
        },
        confidence: 0.88,
      };

      const result = NormalizeResultSchema.safeParse(multiCategory);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.categories).toHaveLength(2);
        expect(result.data.categories).toContain('REGULATORY_LEGAL');
        expect(result.data.categories).toContain('SAFETY_YOUTH_RISK');
      }
    });

    it('should reject confidence outside 0-1 range', () => {
      const invalidConfidence = {
        summary: 'A summary',
        suggestedHeadline: 'A headline',
        categories: ['PRODUCT_UPDATE'],
        entities: {
          platforms: [],
          companies: [],
          people: [],
          topics: [],
        },
        confidence: 1.5, // Invalid: > 1
      };

      const result = NormalizeResultSchema.safeParse(invalidConfidence);
      expect(result.success).toBe(false);
    });

    it('should reject summary exceeding max length', () => {
      const longSummary = {
        summary: 'A'.repeat(501), // Exceeds 500 char limit
        suggestedHeadline: 'A headline',
        categories: ['PRODUCT_UPDATE'],
        entities: {
          platforms: [],
          companies: [],
          people: [],
          topics: [],
        },
        confidence: 0.5,
      };

      const result = NormalizeResultSchema.safeParse(longSummary);
      expect(result.success).toBe(false);
    });

    it('should reject headline exceeding max length', () => {
      const longHeadline = {
        summary: 'A valid summary',
        suggestedHeadline: 'H'.repeat(121), // Exceeds 120 char limit
        categories: ['PRODUCT_UPDATE'],
        entities: {
          platforms: [],
          companies: [],
          people: [],
          topics: [],
        },
        confidence: 0.5,
      };

      const result = NormalizeResultSchema.safeParse(longHeadline);
      expect(result.success).toBe(false);
    });
  });

  describe('EntitiesSchema', () => {
    it('should provide default empty arrays for missing fields', () => {
      const partialEntities = {
        platforms: ['replika'],
        // other fields missing
      };

      const result = EntitiesSchema.safeParse(partialEntities);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.platforms).toEqual(['replika']);
        expect(result.data.companies).toEqual([]);
        expect(result.data.people).toEqual([]);
        expect(result.data.topics).toEqual([]);
      }
    });

    it('should accept complete entities object', () => {
      const fullEntities = {
        platforms: ['replika', 'character-ai'],
        companies: ['Luka Inc', 'Character AI Inc'],
        people: ['Eugenia Kuyda'],
        topics: ['AI safety', 'regulations'],
      };

      const result = EntitiesSchema.safeParse(fullEntities);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.platforms).toHaveLength(2);
        expect(result.data.companies).toHaveLength(2);
        expect(result.data.people).toHaveLength(1);
        expect(result.data.topics).toHaveLength(2);
      }
    });

    it('should provide defaults for empty object', () => {
      const result = EntitiesSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.platforms).toEqual([]);
        expect(result.data.companies).toEqual([]);
        expect(result.data.people).toEqual([]);
        expect(result.data.topics).toEqual([]);
      }
    });
  });

  describe('Category Validation', () => {
    const validCategories = [
      'PRODUCT_UPDATE',
      'MONETIZATION_CHANGE',
      'SAFETY_YOUTH_RISK',
      'NSFW_CONTENT_POLICY',
      'CULTURAL_TREND',
      'REGULATORY_LEGAL',
      'BUSINESS_FUNDING',
    ];

    it.each(validCategories)('should accept valid category: %s', (category) => {
      const response = {
        summary: 'A summary',
        suggestedHeadline: 'A headline',
        categories: [category],
        entities: {
          platforms: [],
          companies: [],
          people: [],
          topics: [],
        },
        confidence: 0.5,
      };

      const result = NormalizeResultSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('JSON Parsing Edge Cases', () => {
    it('should handle JSON with extra whitespace', () => {
      const jsonString = `{
        "summary": "A summary with whitespace",
        "suggestedHeadline": "Headline",
        "categories": ["PRODUCT_UPDATE"],
        "entities": {
          "platforms": [],
          "companies": [],
          "people": [],
          "topics": []
        },
        "confidence": 0.8
      }`;

      const parsed = JSON.parse(jsonString);
      const result = NormalizeResultSchema.safeParse(parsed);
      expect(result.success).toBe(true);
    });

    it('should handle unicode in text fields', () => {
      const unicodeResponse = {
        summary: 'Summary with emoji 🤖 and unicode: 日本語',
        suggestedHeadline: 'AI Companion News 🚀',
        categories: ['PRODUCT_UPDATE'],
        entities: {
          platforms: ['replika'],
          companies: [],
          people: ['田中太郎'],
          topics: ['AI'],
        },
        confidence: 0.9,
      };

      const result = NormalizeResultSchema.safeParse(unicodeResponse);
      expect(result.success).toBe(true);
    });

    it('should handle newlines in summary', () => {
      const multilineResponse = {
        summary: 'First paragraph.\n\nSecond paragraph with more details.',
        suggestedHeadline: 'Multi-paragraph Summary',
        categories: ['PRODUCT_UPDATE'],
        entities: {
          platforms: [],
          companies: [],
          people: [],
          topics: [],
        },
        confidence: 0.7,
      };

      const result = NormalizeResultSchema.safeParse(multilineResponse);
      expect(result.success).toBe(true);
    });
  });

  describe('Real-world LLM Response Examples', () => {
    it('should parse typical OpenAI response format', () => {
      // Simulates a typical OpenAI JSON response
      const openAIResponse = {
        summary: "Character.AI has announced changes to its content filtering system, affecting how users interact with AI characters. The update aims to balance safety concerns with user experience.",
        suggestedHeadline: "Character.AI Updates Content Filtering",
        categories: ["NSFW_CONTENT_POLICY", "PRODUCT_UPDATE"],
        entities: {
          platforms: ["character-ai"],
          companies: ["Character AI Inc"],
          people: [],
          topics: ["content moderation", "AI safety", "user experience"]
        },
        confidence: 0.92
      };

      const result = NormalizeResultSchema.safeParse(openAIResponse);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entities.platforms).toContain('character-ai');
        expect(result.data.categories).toContain('NSFW_CONTENT_POLICY');
      }
    });

    it('should parse regulatory news response', () => {
      const regulatoryResponse = {
        summary: "The FTC has opened an investigation into AI companion apps following complaints about data privacy and age verification practices. Multiple platforms are under scrutiny.",
        suggestedHeadline: "FTC Investigates AI Companion Platforms",
        categories: ["REGULATORY_LEGAL", "SAFETY_YOUTH_RISK"],
        entities: {
          platforms: ["replika", "character-ai", "nomi"],
          companies: ["FTC", "Luka Inc"],
          people: ["Lina Khan"],
          topics: ["regulation", "privacy", "age verification"]
        },
        confidence: 0.88
      };

      const result = NormalizeResultSchema.safeParse(regulatoryResponse);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.entities.platforms).toHaveLength(3);
        expect(result.data.categories).toContain('REGULATORY_LEGAL');
      }
    });

    it('should parse funding announcement response', () => {
      const fundingResponse = {
        summary: "AI companion startup Kindroid has raised $15 million in Series A funding led by Andreessen Horowitz. The company plans to expand its platform and hire additional engineers.",
        suggestedHeadline: "Kindroid Raises $15M Series A",
        categories: ["BUSINESS_FUNDING"],
        entities: {
          platforms: ["kindroid"],
          companies: ["Kindroid", "Andreessen Horowitz"],
          people: [],
          topics: ["funding", "startup", "series A"]
        },
        confidence: 0.95
      };

      const result = NormalizeResultSchema.safeParse(fundingResponse);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.categories).toEqual(['BUSINESS_FUNDING']);
        expect(result.data.confidence).toBeGreaterThan(0.9);
      }
    });
  });
});
