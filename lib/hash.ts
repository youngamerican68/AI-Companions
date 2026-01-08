import { createHash } from 'crypto';

/**
 * Generate SHA256 hash of content for deduplication
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Generate a content hash from URL + title + date bucket
 * Used for deduplication when externalId is not available
 */
export function generateContentHash(
  url: string,
  title: string | null | undefined,
  publishedAt: Date | null | undefined
): string {
  const normalizedUrl = normalizeUrl(url);
  const normalizedTitle = (title || '').toLowerCase().trim();
  const dateBucket = publishedAt
    ? publishedAt.toISOString().slice(0, 10) // YYYY-MM-DD
    : 'unknown';

  return hashContent(`${normalizedUrl}|${normalizedTitle}|${dateBucket}`);
}

/**
 * Normalize URL for consistent hashing
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing slashes, normalize to lowercase
    return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, '')}`.toLowerCase();
  } catch {
    return url.toLowerCase().trim();
  }
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    // Fallback: try to extract domain-like pattern
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/]+)/);
    return match?.[1]?.replace(/^www\./, '') || url;
  }
}

/**
 * Convert a string fingerprint to a BigInt for pg_advisory_lock
 * Takes first 15 hex chars (60 bits) to stay within signed 64-bit range
 */
export function fingerprintToLockKey(fingerprint: string): bigint {
  const hash = hashContent(fingerprint);
  // Take first 15 hex chars (60 bits) to stay within signed 64-bit range
  return BigInt('0x' + hash.slice(0, 15));
}

/**
 * Truncate text to a maximum length, preserving word boundaries
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.8) {
    return truncated.slice(0, lastSpace) + '...';
  }

  return truncated + '...';
}

/**
 * Extract top keywords from text (simple TF approach)
 */
export function extractTopKeywords(text: string, count: number = 5): string[] {
  // Simple stopwords list
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this',
    'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
    'we', 'us', 'our', 'you', 'your', 'he', 'she', 'him', 'her', 'his',
    'i', 'me', 'my', 'not', 'no', 'yes', 'so', 'if', 'then', 'than',
    'when', 'where', 'what', 'which', 'who', 'how', 'why', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
    'only', 'own', 'same', 'also', 'just', 'now', 'new', 'says', 'said',
  ]);

  // Tokenize and count
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopwords.has(word));

  const wordCounts = new Map<string, number>();
  for (const word of words) {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  }

  // Sort by count and return top N
  return Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([word]) => word);
}
