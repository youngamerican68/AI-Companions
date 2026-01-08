import { db, Prisma } from '@/lib/db';
import { getLLMProvider, LLMError, PROMPT_VERSION } from '@/lib/llm';
import { truncateText } from '@/lib/hash';
import { fetchOgImage } from '@/lib/og-image';
import type { IngestStatus, Category } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

export interface NormalizeInput {
  signalId: string;
  title?: string | null;
  url: string;
  sourceName: string;
  publishedAt?: Date | null;
  rawText?: string | null;
}

export interface NormalizeOutput {
  signalId: string;
  success: boolean;
  ingestStatus: IngestStatus;
  ingestReason?: string;
  normalizedSummary?: string;
  suggestedHeadline?: string;
  categories?: Category[];
  entities?: {
    platforms: string[];
    companies: string[];
    people: string[];
    topics: string[];
    unknownPlatforms?: string[];
  };
  confidence?: number;
  imageUrl?: string;
  llmProvider?: string;
  llmModel?: string;
  promptVersion?: string;
  llmRawResponse?: string;
}

// =============================================================================
// Normalization Functions
// =============================================================================

const MAX_RAW_RESPONSE_LENGTH = 20000;
const MIN_TEXT_LENGTH = 50; // Minimum text length to process
const MIN_CONFIDENCE_THRESHOLD = 0.6; // Reject articles below this confidence

/**
 * Normalize a signal using LLM
 */
export async function normalizeSignal(input: NormalizeInput): Promise<NormalizeOutput> {
  const { signalId, title, url, sourceName, publishedAt, rawText } = input;

  // Build text to process
  const textParts: string[] = [];
  if (title) textParts.push(title);
  if (rawText) textParts.push(rawText);
  const text = textParts.join('\n\n');

  // Skip if text is too short
  if (text.length < MIN_TEXT_LENGTH) {
    return {
      signalId,
      success: false,
      ingestStatus: 'REJECTED',
      ingestReason: `Text too short (${text.length} chars, minimum ${MIN_TEXT_LENGTH})`,
    };
  }

  try {
    const provider = getLLMProvider();
    const response = await provider.normalize(text, {
      title: title || undefined,
      url,
      sourceName,
      publishedAt,
    });

    // Validate platforms against known platforms
    const { knownPlatforms, unknownPlatforms } = await validatePlatforms(
      response.result.entities.platforms
    );

    // Reject low-confidence articles (not relevant to AI companions)
    const confidence = response.result.confidence ?? 0;
    if (confidence < MIN_CONFIDENCE_THRESHOLD) {
      return {
        signalId,
        success: false,
        ingestStatus: 'REJECTED',
        ingestReason: `Low relevance to AI companions (confidence: ${confidence.toFixed(2)})`,
        confidence,
        llmProvider: provider.name,
        llmModel: response.model,
        promptVersion: response.promptVersion,
        llmRawResponse: truncateText(response.rawResponse, MAX_RAW_RESPONSE_LENGTH),
      };
    }

    // Fetch Open Graph image for accepted articles
    const imageUrl = await fetchOgImage(url).catch(() => null);

    return {
      signalId,
      success: true,
      ingestStatus: 'ACCEPTED',
      normalizedSummary: response.result.summary,
      suggestedHeadline: response.result.suggestedHeadline,
      categories: response.result.categories,
      entities: {
        ...response.result.entities,
        platforms: knownPlatforms,
        unknownPlatforms,
      },
      confidence,
      imageUrl: imageUrl || undefined,
      llmProvider: provider.name,
      llmModel: response.model,
      promptVersion: response.promptVersion,
      llmRawResponse: truncateText(response.rawResponse, MAX_RAW_RESPONSE_LENGTH),
    };
  } catch (error) {
    const errorMessage =
      error instanceof LLMError
        ? error.message
        : (error as Error).message || 'Unknown error';

    console.error(`Normalization failed for signal ${signalId}:`, errorMessage);

    return {
      signalId,
      success: false,
      ingestStatus: 'FAILED',
      ingestReason: `LLM error: ${errorMessage}`,
    };
  }
}

/**
 * Validate platform slugs against known platforms
 */
async function validatePlatforms(
  inferredSlugs: string[]
): Promise<{ knownPlatforms: string[]; unknownPlatforms: string[] }> {
  if (inferredSlugs.length === 0) {
    return { knownPlatforms: [], unknownPlatforms: [] };
  }

  // Normalize slugs (lowercase, trim)
  const normalizedSlugs = inferredSlugs.map((s) =>
    s.toLowerCase().trim().replace(/\s+/g, '-')
  );

  const knownPlatforms = await db.platform.findMany({
    where: { slug: { in: normalizedSlugs } },
    select: { slug: true },
  });

  const knownSet = new Set(knownPlatforms.map((p) => p.slug));

  return {
    knownPlatforms: normalizedSlugs.filter((s) => knownSet.has(s)),
    unknownPlatforms: normalizedSlugs.filter((s) => !knownSet.has(s)),
  };
}

/**
 * Update signal with normalization results
 */
export async function updateSignalWithNormalization(
  output: NormalizeOutput
): Promise<void> {
  const updateData: Prisma.SignalUpdateInput = {
    ingestStatus: output.ingestStatus,
    ingestReason: output.ingestReason,
    normalizedAt: new Date(),
  };

  if (output.success) {
    updateData.normalizedSummary = output.normalizedSummary;
    updateData.suggestedHeadline = output.suggestedHeadline;
    updateData.categories = output.categories;
    updateData.entities = output.entities as Prisma.InputJsonValue;
    updateData.confidence = output.confidence;
    updateData.imageUrl = output.imageUrl;
    updateData.llmProvider = output.llmProvider;
    updateData.llmModel = output.llmModel;
    updateData.promptVersion = output.promptVersion;
    updateData.llmRawResponse = output.llmRawResponse;
  }

  await db.signal.update({
    where: { id: output.signalId },
    data: updateData,
  });
}

/**
 * Normalize and update a signal in one step
 */
export async function normalizeAndUpdateSignal(
  input: NormalizeInput
): Promise<NormalizeOutput> {
  const output = await normalizeSignal(input);
  await updateSignalWithNormalization(output);
  return output;
}

/**
 * Create platform junction records for a signal
 */
export async function linkSignalToPlatforms(
  signalId: string,
  platformSlugs: string[]
): Promise<void> {
  if (platformSlugs.length === 0) return;

  const platforms = await db.platform.findMany({
    where: { slug: { in: platformSlugs } },
    select: { id: true },
  });

  if (platforms.length === 0) return;

  await db.signalPlatform.createMany({
    data: platforms.map((p) => ({
      signalId,
      platformId: p.id,
    })),
    skipDuplicates: true,
  });
}
