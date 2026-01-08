/**
 * TF-IDF based similarity calculation for clustering
 *
 * This module provides lightweight text similarity without external ML dependencies.
 * Used as Phase 2 of clustering after pg_trgm candidate selection.
 */

// Simple stopwords list for filtering
const STOPWORDS = new Set([
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
  'like', 'get', 'got', 'one', 'two', 'first', 'last', 'being', 'make',
  'made', 'use', 'using', 'used', 'via', 'still', 'even', 'well',
]);

/**
 * Tokenize text into normalized terms
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/**
 * Compute term frequency (TF) for a document
 */
export function computeTF(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  // Normalize by document length
  const maxFreq = Math.max(...Array.from(tf.values()), 1);
  for (const [term, freq] of Array.from(tf.entries())) {
    tf.set(term, freq / maxFreq);
  }
  return tf;
}

/**
 * Compute inverse document frequency (IDF) from a corpus
 */
export function computeIDF(documents: string[][]): Map<string, number> {
  const docCount = documents.length;
  const termDocCounts = new Map<string, number>();

  for (const doc of documents) {
    const uniqueTerms = new Set(doc);
    for (const term of Array.from(uniqueTerms)) {
      termDocCounts.set(term, (termDocCounts.get(term) || 0) + 1);
    }
  }

  const idf = new Map<string, number>();
  for (const [term, count] of Array.from(termDocCounts.entries())) {
    idf.set(term, Math.log(docCount / count) + 1);
  }

  return idf;
}

/**
 * Compute TF-IDF vector for a document
 */
export function computeTFIDF(
  tokens: string[],
  idf: Map<string, number>
): Map<string, number> {
  const tf = computeTF(tokens);
  const tfidf = new Map<string, number>();

  for (const [term, tfValue] of Array.from(tf.entries())) {
    const idfValue = idf.get(term) || Math.log(10); // Default IDF for unknown terms
    tfidf.set(term, tfValue * idfValue);
  }

  return tfidf;
}

/**
 * Compute cosine similarity between two TF-IDF vectors
 */
export function cosineSimilarity(
  vec1: Map<string, number>,
  vec2: Map<string, number>
): number {
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  // Compute dot product
  for (const [term, value] of Array.from(vec1.entries())) {
    const value2 = vec2.get(term) || 0;
    dotProduct += value * value2;
    norm1 += value * value;
  }

  for (const [, value] of Array.from(vec2.entries())) {
    norm2 += value * value;
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Find most similar document from candidates
 */
export interface SimilarityMatch {
  index: number;
  similarity: number;
}

export function findMostSimilar(
  queryTokens: string[],
  candidateTokens: string[][],
  threshold: number = 0.4
): SimilarityMatch | null {
  if (candidateTokens.length === 0) return null;

  // Build IDF from candidates + query
  const allDocs = [...candidateTokens, queryTokens];
  const idf = computeIDF(allDocs);

  // Compute query TF-IDF
  const queryVector = computeTFIDF(queryTokens, idf);

  let bestMatch: SimilarityMatch | null = null;

  for (let i = 0; i < candidateTokens.length; i++) {
    const candidateVector = computeTFIDF(candidateTokens[i], idf);
    const similarity = cosineSimilarity(queryVector, candidateVector);

    if (similarity >= threshold) {
      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { index: i, similarity };
      }
    }
  }

  return bestMatch;
}

/**
 * Compute platform overlap bonus
 * Signals mentioning the same platforms are more likely to be related
 */
export function platformOverlapBonus(
  platforms1: string[],
  platforms2: string[]
): number {
  if (platforms1.length === 0 || platforms2.length === 0) return 0;

  const set1 = new Set(platforms1.map((p) => p.toLowerCase()));
  const set2 = new Set(platforms2.map((p) => p.toLowerCase()));

  let overlap = 0;
  for (const p of Array.from(set1)) {
    if (set2.has(p)) overlap++;
  }

  // Return bonus (0.2 per overlapping platform, max 0.4)
  return Math.min(overlap * 0.2, 0.4);
}

/**
 * Build searchText from headline and summary for pg_trgm indexing
 */
export function buildSearchText(headline: string, summary?: string): string {
  const parts = [headline];

  if (summary) {
    // Extract key terms from summary
    const tokens = tokenize(summary);
    const tf = computeTF(tokens);

    // Get top 10 terms by frequency
    const topTerms = Array.from(tf.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term]) => term);

    parts.push(...topTerms);
  }

  return parts.join(' ');
}
