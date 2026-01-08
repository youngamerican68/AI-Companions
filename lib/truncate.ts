/**
 * Text truncation utilities for bounded database fields.
 * Ensures that text fields don't exceed their defined limits.
 */

// Field size limits (in characters)
export const LIMITS = {
  rawText: 20_000,           // 20KB for full article text
  llmRawResponse: 20_000,    // 20KB for LLM debugging
  normalizedSummary: 2_000,  // 2KB for summary
  contextSummary: 1_000,     // 1KB for cluster summary
  suggestedHeadline: 200,    // 200 chars for signal headline
  clusterHeadline: 200,      // 200 chars for cluster headline
  ingestReason: 500,         // 500 chars for rejection reason
} as const;

export type TruncateField = keyof typeof LIMITS;

/**
 * Truncate text to fit within field limits.
 * Adds "..." suffix if truncation occurs.
 *
 * @param text - The text to truncate
 * @param field - The field name (determines max length)
 * @returns Truncated text or null if input was null/undefined
 */
export function truncate(
  text: string | null | undefined,
  field: TruncateField
): string | null {
  if (text === null || text === undefined) return null;
  if (text === '') return '';

  const limit = LIMITS[field];
  if (text.length <= limit) return text;

  // Truncate and add ellipsis
  return text.slice(0, limit - 3) + '...';
}

/**
 * Truncate text without null handling (for required fields).
 *
 * @param text - The text to truncate
 * @param field - The field name (determines max length)
 * @returns Truncated text
 */
export function truncateRequired(text: string, field: TruncateField): string {
  const limit = LIMITS[field];
  if (text.length <= limit) return text;
  return text.slice(0, limit - 3) + '...';
}

/**
 * Check if text exceeds field limit.
 *
 * @param text - The text to check
 * @param field - The field name (determines max length)
 * @returns true if text exceeds limit
 */
export function exceedsLimit(
  text: string | null | undefined,
  field: TruncateField
): boolean {
  if (!text) return false;
  return text.length > LIMITS[field];
}

/**
 * Truncate JSON to fit within field limits.
 * Stringifies the object first, then truncates if needed.
 *
 * @param obj - The object to stringify and truncate
 * @param field - The field name (determines max length)
 * @returns Truncated JSON string or null
 */
export function truncateJson(
  obj: unknown,
  field: TruncateField
): string | null {
  if (obj === null || obj === undefined) return null;

  try {
    const json = JSON.stringify(obj);
    return truncate(json, field);
  } catch {
    return null;
  }
}
