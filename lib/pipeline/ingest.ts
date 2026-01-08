import { db, Prisma } from '@/lib/db';
import { generateContentHash, extractDomain, truncateText } from '@/lib/hash';
import { parseDate } from '@/lib/time';
import { rssConnector } from '@/lib/sources/rss';
import { getEnabledFeeds } from '@/config/feeds';
import type { SourceConfig, RawFetchedItem, FetchResult } from '@/lib/sources/types';
import type { SourceType, IngestRun, RunStatus } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

export interface IngestResult {
  runId: string;
  signalsFetched: number;
  signalsAccepted: number;
  signalsRejected: number;
  errors: IngestError[];
  durationMs: number;
}

export interface IngestError {
  source: string;
  url?: string;
  message: string;
  code?: string;
}

export interface CreatedSignal {
  id: string;
  rawSignalId: string;
  title: string | null;
  rawText: string | null;
  url: string;
  sourceName: string;
  publishedAt: Date | null;
}

// =============================================================================
// Ingestion Functions
// =============================================================================

const MAX_RAW_TEXT_LENGTH = 20000;

/**
 * Create an ingest run record
 */
export async function createIngestRun(): Promise<IngestRun> {
  return db.ingestRun.create({
    data: {
      status: 'RUNNING',
    },
  });
}

/**
 * Update an ingest run with results
 */
export async function updateIngestRun(
  runId: string,
  data: {
    status: RunStatus;
    signalsFetched: number;
    signalsAccepted: number;
    signalsRejected: number;
    errors?: IngestError[];
  }
): Promise<void> {
  await db.ingestRun.update({
    where: { id: runId },
    data: {
      status: data.status,
      signalsFetched: data.signalsFetched,
      signalsAccepted: data.signalsAccepted,
      signalsRejected: data.signalsRejected,
      errors: (data.errors ?? null) as unknown as Prisma.InputJsonValue,
      finishedAt: new Date(),
    },
  });
}

/**
 * Fetch from all enabled sources
 */
export async function fetchFromSources(
  maxItems?: number
): Promise<{ items: RawFetchedItem[]; errors: IngestError[] }> {
  const feeds = getEnabledFeeds();
  const allItems: RawFetchedItem[] = [];
  const allErrors: IngestError[] = [];

  for (const feed of feeds) {
    try {
      const result = await fetchFromSource(feed);
      allItems.push(...result.items);

      for (const error of result.errors) {
        allErrors.push({
          source: feed.name,
          url: error.url,
          message: error.message,
          code: error.code,
        });
      }
    } catch (error) {
      allErrors.push({
        source: feed.name,
        url: feed.url,
        message: (error as Error).message,
        code: 'FETCH_ERROR',
      });
    }
  }

  // Apply max items limit if specified
  const items = maxItems ? allItems.slice(0, maxItems) : allItems;

  return { items, errors: allErrors };
}

/**
 * Fetch from a single source
 */
async function fetchFromSource(config: SourceConfig): Promise<FetchResult> {
  // Currently only RSS is fully implemented
  if (rssConnector.canHandle(config)) {
    return rssConnector.fetch(config);
  }

  // Return empty result for unsupported sources
  return {
    items: [],
    errors: [
      {
        message: `No connector available for source type: ${config.type}`,
        source: config.name,
        url: config.url,
      },
    ],
    metadata: {
      fetchedAt: new Date(),
      itemCount: 0,
      durationMs: 0,
    },
  };
}

/**
 * Check if a raw signal already exists (dedupe)
 */
async function isSignalDuplicate(contentHash: string): Promise<boolean> {
  const existing = await db.rawSignal.findUnique({
    where: { contentHash },
    select: { id: true },
  });
  return !!existing;
}

/**
 * Store a raw signal and create a pending signal record
 */
export async function storeRawSignal(
  item: RawFetchedItem,
  config: SourceConfig
): Promise<CreatedSignal | null> {
  // Generate content hash for dedupe
  const contentHash = item.externalId
    ? generateContentHash(item.sourceUrl, item.externalId, null)
    : generateContentHash(item.sourceUrl, item.title || null, item.publishedAt || null);

  // Check for duplicate
  if (await isSignalDuplicate(contentHash)) {
    return null;
  }

  const sourceDomain = extractDomain(item.sourceUrl);
  const rawText = item.rawText
    ? truncateText(item.rawText, MAX_RAW_TEXT_LENGTH)
    : null;

  // Create raw signal and signal in a transaction
  const result = await db.$transaction(async (tx) => {
    const rawSignal = await tx.rawSignal.create({
      data: {
        sourceType: config.type,
        sourceName: config.name,
        sourceUrl: item.sourceUrl,
        sourceDomain,
        externalId: item.externalId,
        rawContentType: item.rawContentType,
        rawPayload: item.rawPayload as Prisma.InputJsonValue,
        rawText,
        contentHash,
      },
    });

    const signal = await tx.signal.create({
      data: {
        rawSignalId: rawSignal.id,
        canonicalUrl: item.sourceUrl,
        title: item.title?.slice(0, 500) || null,
        author: item.author,
        publishedAt: parseDate(item.publishedAt),
        ingestStatus: 'PENDING',
      },
    });

    return {
      id: signal.id,
      rawSignalId: rawSignal.id,
      title: item.title || null,
      rawText,
      url: item.sourceUrl,
      sourceName: config.name,
      publishedAt: parseDate(item.publishedAt),
    };
  });

  return result;
}

/**
 * Process fetched items and store as signals
 */
export async function processFetchedItems(
  items: RawFetchedItem[],
  sourceConfigs: Map<string, SourceConfig>
): Promise<{ created: CreatedSignal[]; duplicates: number }> {
  const created: CreatedSignal[] = [];
  let duplicates = 0;

  for (const item of items) {
    // Find matching source config
    let config = sourceConfigs.get(item.sourceUrl);

    if (!config) {
      // Try to find by domain
      const domain = extractDomain(item.sourceUrl);
      for (const [, c] of Array.from(sourceConfigs.entries())) {
        if (c.url.includes(domain)) {
          config = c;
          break;
        }
      }
    }

    if (!config) {
      // Use default config
      config = {
        name: extractDomain(item.sourceUrl),
        type: 'MEDIA' as SourceType,
        url: item.sourceUrl,
        enabled: true,
      };
    }

    try {
      const signal = await storeRawSignal(item, config);
      if (signal) {
        created.push(signal);
      } else {
        duplicates++;
      }
    } catch (error) {
      console.error(`Failed to store signal from ${item.sourceUrl}:`, error);
    }
  }

  return { created, duplicates };
}

/**
 * Build source config map from feeds
 */
export function buildSourceConfigMap(): Map<string, SourceConfig> {
  const feeds = getEnabledFeeds();
  const map = new Map<string, SourceConfig>();

  for (const feed of feeds) {
    map.set(feed.url, feed);
  }

  return map;
}
