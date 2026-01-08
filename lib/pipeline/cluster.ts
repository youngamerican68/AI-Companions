import { db, Prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { hashContent, fingerprintToLockKey, extractTopKeywords } from '@/lib/hash';
import { getDateBucket } from '@/lib/time';
import { truncateRequired } from '@/lib/truncate';
import {
  tokenize,
  findMostSimilar,
  platformOverlapBonus,
  buildSearchText,
} from './similarity';
import { updateClusterRanking } from './rank';
import type { Category, Signal, StoryCluster } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

interface SignalForClustering {
  id: string;
  suggestedHeadline: string | null;
  normalizedSummary: string | null;
  categories: Category[];
  entities: {
    platforms?: string[];
    companies?: string[];
    people?: string[];
    topics?: string[];
  } | null;
  publishedAt: Date | null;
  createdAt: Date;
}

interface ClusterCandidate {
  id: string;
  fingerprint: string;
  headline: string;
  searchText: string;
  similarity: number;
}

// =============================================================================
// Fingerprint Functions
// =============================================================================

/**
 * Compute stable fingerprint for cluster deduplication
 */
export function computeClusterFingerprint(signal: SignalForClustering): string {
  const platforms = (signal.entities?.platforms || []).sort().join(',');
  const dateBucket = getDateBucket(signal.publishedAt || signal.createdAt);
  const keywords = extractTopKeywords(
    signal.suggestedHeadline || signal.normalizedSummary || '',
    5
  ).join(',');

  return `${platforms}|${dateBucket}|${keywords}`;
}

// =============================================================================
// Candidate Selection (pg_trgm Phase 1)
// =============================================================================

/**
 * Find candidate clusters using pg_trgm similarity
 */
async function findCandidateClusters(
  searchText: string,
  tx: Prisma.TransactionClient
): Promise<ClusterCandidate[]> {
  const env = getEnv();
  const activeDays = env.CLUSTER_ACTIVE_DAYS;
  const threshold = env.CLUSTER_TRGM_THRESHOLD;

  // Set pg_trgm threshold using SET LOCAL (transaction-scoped, no bleed to other connections)
  // IMPORTANT: Must use SET LOCAL, not set_limit() which is session-scoped and can stick on pooled connections
  await tx.$executeRawUnsafe(`SET LOCAL pg_trgm.similarity_threshold = ${threshold}`);

  // Find candidates using % operator (uses GIN index)
  const candidates = await tx.$queryRaw<ClusterCandidate[]>`
    SELECT
      id,
      fingerprint,
      headline,
      "searchText",
      similarity("searchText", ${searchText}) as similarity
    FROM "StoryCluster"
    WHERE status = 'ACTIVE'
      AND "lastSignalAt" > NOW() - INTERVAL '${Prisma.raw(String(activeDays))} days'
      AND "searchText" % ${searchText}
    ORDER BY similarity DESC
    LIMIT 10
  `;

  return candidates;
}

// =============================================================================
// Clustering Logic
// =============================================================================

/**
 * Assign a signal to an existing cluster or create a new one
 */
export async function assignOrCreateCluster(
  signalId: string
): Promise<{ clusterId: string; isNew: boolean }> {
  // Fetch signal with needed fields
  const signal = await db.signal.findUnique({
    where: { id: signalId },
    select: {
      id: true,
      suggestedHeadline: true,
      normalizedSummary: true,
      categories: true,
      entities: true,
      publishedAt: true,
      createdAt: true,
    },
  });

  if (!signal) {
    throw new Error(`Signal not found: ${signalId}`);
  }

  // Skip if not accepted
  const fullSignal = await db.signal.findUnique({
    where: { id: signalId },
    select: { ingestStatus: true },
  });

  if (fullSignal?.ingestStatus !== 'ACCEPTED') {
    throw new Error(`Signal not accepted: ${signalId}`);
  }

  const fingerprint = computeClusterFingerprint(signal as SignalForClustering);
  const lockKey = fingerprintToLockKey(fingerprint);

  // Transaction with advisory lock
  return await db.$transaction(async (tx) => {
    // Use pg_advisory_xact_lock - auto-releases on commit/rollback
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

    // 1. Check exact fingerprint match first
    const existingByFingerprint = await tx.storyCluster.findUnique({
      where: { fingerprint },
    });

    if (existingByFingerprint) {
      await attachSignalToCluster(signalId, existingByFingerprint.id, tx);
      return { clusterId: existingByFingerprint.id, isNew: false };
    }

    // 2. Find similar clusters using pg_trgm + TF-IDF
    const searchText = buildSearchText(
      signal.suggestedHeadline || '',
      signal.normalizedSummary || ''
    );

    const similarCluster = await findSimilarCluster(
      signal as SignalForClustering,
      searchText,
      tx
    );

    if (similarCluster) {
      await attachSignalToCluster(signalId, similarCluster.id, tx);
      return { clusterId: similarCluster.id, isNew: false };
    }

    // 3. Create new cluster
    try {
      const cluster = await createNewCluster(
        signal as SignalForClustering,
        fingerprint,
        searchText,
        tx
      );
      await attachSignalToCluster(signalId, cluster.id, tx);
      return { clusterId: cluster.id, isNew: true };
    } catch (error) {
      // Handle P2002 unique constraint violation (race condition)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raceWinner = await tx.storyCluster.findUnique({
          where: { fingerprint },
        });

        if (raceWinner) {
          await attachSignalToCluster(signalId, raceWinner.id, tx);
          return { clusterId: raceWinner.id, isNew: false };
        }
      }
      throw error;
    }
  });
}

/**
 * Find similar cluster using TF-IDF (Phase 2)
 */
async function findSimilarCluster(
  signal: SignalForClustering,
  searchText: string,
  tx: Prisma.TransactionClient
): Promise<StoryCluster | null> {
  const env = getEnv();

  // Get candidates from pg_trgm
  const candidates = await findCandidateClusters(searchText, tx);

  if (candidates.length === 0) return null;

  // Tokenize signal text
  const signalTokens = tokenize(searchText);
  const candidateTokens = candidates.map((c) => tokenize(c.searchText));

  // Find best match using TF-IDF cosine similarity
  const match = findMostSimilar(
    signalTokens,
    candidateTokens,
    env.CLUSTER_SIMILARITY_THRESHOLD
  );

  if (!match) return null;

  const bestCandidate = candidates[match.index];

  // Add platform overlap bonus
  const signalPlatforms = signal.entities?.platforms || [];
  // Fetch cluster platforms
  const clusterPlatforms = await tx.clusterPlatform.findMany({
    where: { clusterId: bestCandidate.id },
    include: { platform: { select: { slug: true } } },
  });
  const clusterPlatformSlugs = clusterPlatforms.map((cp) => cp.platform.slug);

  const bonus = platformOverlapBonus(signalPlatforms, clusterPlatformSlugs);
  const adjustedSimilarity = match.similarity + bonus;

  if (adjustedSimilarity < env.CLUSTER_SIMILARITY_THRESHOLD) {
    return null;
  }

  return tx.storyCluster.findUnique({ where: { id: bestCandidate.id } });
}

/**
 * Create a new cluster
 */
async function createNewCluster(
  signal: SignalForClustering,
  fingerprint: string,
  searchText: string,
  tx: Prisma.TransactionClient
): Promise<StoryCluster> {
  // Truncate fields to enforce bounded storage
  const headline = truncateRequired(
    signal.suggestedHeadline || 'Untitled Story',
    'clusterHeadline'
  );
  const contextSummary = truncateRequired(
    signal.normalizedSummary || '',
    'contextSummary'
  );

  const cluster = await tx.storyCluster.create({
    data: {
      fingerprint,
      headline,
      contextSummary,
      searchText,
      categories: signal.categories,
      firstSeenAt: signal.publishedAt || signal.createdAt,
      lastSignalAt: signal.createdAt,
      status: 'ACTIVE',
    },
  });

  // Create platform links
  const platformSlugs = signal.entities?.platforms || [];
  if (platformSlugs.length > 0) {
    const platforms = await tx.platform.findMany({
      where: { slug: { in: platformSlugs } },
      select: { id: true },
    });

    if (platforms.length > 0) {
      await tx.clusterPlatform.createMany({
        data: platforms.map((p) => ({
          clusterId: cluster.id,
          platformId: p.id,
        })),
      });
    }
  }

  return cluster;
}

/**
 * Attach a signal to an existing cluster
 */
async function attachSignalToCluster(
  signalId: string,
  clusterId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  const now = new Date();

  // Update signal's cluster reference
  await tx.signal.update({
    where: { id: signalId },
    data: { clusterId },
  });

  // Update cluster timestamps
  await tx.storyCluster.update({
    where: { id: clusterId },
    data: {
      lastSignalAt: now,
      lastSeenAt: now,
    },
  });
}

/**
 * Process clustering for a signal and update ranking
 */
export async function clusterAndRank(signalId: string): Promise<string> {
  const { clusterId } = await assignOrCreateCluster(signalId);
  await updateClusterRanking(clusterId);
  return clusterId;
}
