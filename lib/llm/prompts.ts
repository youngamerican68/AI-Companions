import type { NormalizeOptions } from './types';

/**
 * Current prompt version - increment when making significant changes
 */
export const PROMPT_VERSION = 'v1.1';

/**
 * System prompt for normalization
 */
export const NORMALIZE_SYSTEM_PROMPT = `You are a strict content filter for a news aggregator EXCLUSIVELY focused on AI companion/virtual companion platforms.

AI COMPANIONS are apps/services where users form personal relationships with AI characters - chatbots designed for friendship, romance, emotional support, or roleplay. Examples: Replika, Character.AI, Nomi, Kindroid.

CRITICAL: Most articles you see will NOT be relevant. You must REJECT content that is:
- General AI news (ChatGPT, Claude, Gemini, Copilot, etc.) - NOT relevant unless specifically about companion features
- AI hardware/chips (Nvidia, Intel, etc.) - NOT relevant
- Enterprise AI, AI assistants, AI search - NOT relevant
- Self-driving cars, robotics, AI in healthcare - NOT relevant
- General tech company news - NOT relevant
- AI funding/business news UNLESS it's specifically about an AI companion company

ONLY ACCEPT content that is:
- Directly about a known AI companion platform (see list below)
- About regulation/safety specifically targeting AI companions or romantic/social chatbots
- About the AI companion industry as a whole
- About new AI companion startups or products

CONFIDENCE SCORING (be strict):
- 0.9+: Directly names a known AI companion platform
- 0.7-0.9: Clearly about AI companions/romantic chatbots but no specific platform named
- 0.5-0.7: Tangentially related (e.g., chatbot regulation that might affect companions)
- Below 0.5: NOT RELEVANT - general AI news, should be rejected

KNOWN AI COMPANION PLATFORMS (use these slugs):
- replika
- character-ai
- nomi
- kindroid
- paradot
- chai
- crushon-ai
- janitor-ai
- candy-ai
- soulmate-ai

If you encounter a new AI companion platform not in this list, include it in "unknownPlatforms".

FORMATTING:
1. Keep summaries factual and concise (2-3 sentences max)
2. Headlines should be clear and informative
3. For platforms, use lowercase slug format
4. Only assign categories that clearly apply

CATEGORY DEFINITIONS:
- PRODUCT_UPDATE: New features, app updates, version releases
- MONETIZATION_CHANGE: Pricing changes, subscription updates
- SAFETY_YOUTH_RISK: Child safety concerns, age verification
- NSFW_CONTENT_POLICY: Adult content policies, content moderation
- CULTURAL_TREND: Social trends, user behavior, cultural impact
- REGULATORY_LEGAL: Laws, regulations, legal actions
- BUSINESS_FUNDING: Funding rounds, acquisitions (AI companion companies only)`;

/**
 * Build the user prompt for normalization
 */
export function buildNormalizePrompt(text: string, options: NormalizeOptions): string {
  const parts: string[] = [];

  if (options.title) {
    parts.push(`TITLE: ${options.title}`);
  }

  if (options.sourceName) {
    parts.push(`SOURCE: ${options.sourceName}`);
  }

  if (options.url) {
    parts.push(`URL: ${options.url}`);
  }

  if (options.publishedAt) {
    parts.push(`DATE: ${options.publishedAt.toISOString().slice(0, 10)}`);
  }

  parts.push('');
  parts.push('CONTENT:');
  parts.push(text);
  parts.push('');
  parts.push('Analyze this content and provide structured information in the required JSON format.');

  return parts.join('\n');
}

/**
 * Fallback prompt when JSON mode is not available
 */
export function buildNormalizeFallbackPrompt(
  text: string,
  options: NormalizeOptions
): string {
  const userPrompt = buildNormalizePrompt(text, options);

  return `${userPrompt}

RESPOND WITH VALID JSON ONLY. Use this exact structure:
{
  "summary": "2-3 sentence factual summary",
  "suggestedHeadline": "Short headline (max 120 chars)",
  "categories": ["CATEGORY_1", "CATEGORY_2"],
  "entities": {
    "platforms": ["platform-slug"],
    "companies": ["Company Name"],
    "people": ["Person Name"],
    "topics": ["topic"]
  },
  "confidence": 0.85
}

Categories must be from: PRODUCT_UPDATE, MONETIZATION_CHANGE, SAFETY_YOUTH_RISK, NSFW_CONTENT_POLICY, CULTURAL_TREND, REGULATORY_LEGAL, BUSINESS_FUNDING

Platform slugs should be lowercase with hyphens (e.g., "character-ai", not "Character.AI")`;
}

/**
 * Extract JSON from a response that might have extra text
 */
export function extractJsonFromResponse(response: string): string {
  // Try to find JSON object in the response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  // If no JSON found, return the original response
  return response;
}
