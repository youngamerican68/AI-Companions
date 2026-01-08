import { db, Prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import type { Category } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

export interface ScoreBreakdown {
  sourceDiversity: number;
  velocity: number;
  credibility: number;
  category: number;
  recency: number;
  manual: number;
}

export interface RankingResult {
  score: number;
  scoreMillis: number; // Scaled score * 1000 for stable pagination
  breakdown: ScoreBreakdown;
}

// Signal with raw signal data for ranking
type SignalWithRaw = Prisma.SignalGetPayload<{
  include: { rawSignal: true };
}>;

// Cluster with signals for ranking
type ClusterWithSignals = Prisma.StoryClusterGetPayload<{
  include: { signals: { include: { rawSignal: true } } };
}>;

// =============================================================================
// Category Weights
// =============================================================================

const CATEGORY_WEIGHTS: Partial<Record<Category, number>> = {
  SAFETY_YOUTH_RISK: 1.5,
  REGULATORY_LEGAL: 1.5,
  // All others default to 1.0
};

// =============================================================================
// Ranking Functions
// =============================================================================

/**
 * Count signals within a time window (in minutes)
 */
function countSignalsInWindow(
  signals: Array<{ createdAt: Date }>,
  windowMinutes: number
): number {
  const windowMs = windowMinutes * 60 * 1000;
  const now = Date.now();

  return signals.filter((s) => now - s.createdAt.getTime() <= windowMs).length;
}

/**
 * Get average credibility weight for signals
 */
async function getAverageCredibility(signals: SignalWithRaw[]): Promise<number> {
  const domains = new Set(signals.map((s) => s.rawSignal.sourceDomain));

  if (domains.size === 0) return 0.5; // Default weight

  const credibilities = await db.sourceCredibility.findMany({
    where: { sourceDomain: { in: Array.from(domains) } },
  });

  const credMap = new Map(credibilities.map((c) => [c.sourceDomain, c.weight]));

  let total = 0;
  let count = 0;

  for (const signal of signals) {
    const weight = credMap.get(signal.rawSignal.sourceDomain) ?? 0.5; // Default 0.5
    total += weight;
    count++;
  }

  return count > 0 ? total / count : 0.5;
}

/**
 * Compute importance score for a cluster
 */
export async function computeImportanceScore(
  cluster: ClusterWithSignals
): Promise<RankingResult> {
  const env = getEnv();

  // Source diversity: diminishing returns after MAX_DOMAINS unique domains
  const uniqueDomains = new Set(
    cluster.signals.map((s) => s.rawSignal.sourceDomain)
  );
  const sourceDiversity = Math.min(uniqueDomains.size, env.RANKING_MAX_DOMAINS) * 2.0;

  // Velocity: log-scaled to prevent spam
  const signalsLastHour = countSignalsInWindow(cluster.signals, 60);
  const velocity = Math.log1p(signalsLastHour) * 3.0;

  // Credibility: average weight of sources
  const avgCredibility = await getAverageCredibility(cluster.signals);
  const credibility = avgCredibility * 1.5;

  // Category: max weight (not sum) to avoid category spam
  const maxCategoryWeight = Math.max(
    ...cluster.categories.map((c) => CATEGORY_WEIGHTS[c] ?? 1.0),
    1.0
  );
  const category = maxCategoryWeight * 2.0;

  // Recency: exponential decay
  const hoursOld =
    (Date.now() - cluster.lastSignalAt.getTime()) / (1000 * 60 * 60);
  const decayHours = env.RANKING_RECENCY_DECAY_HOURS;
  const recency = Math.exp(-hoursOld / decayHours) * 1.0;

  // Manual boost
  const manual = cluster.manualBoost * 5.0;

  const breakdown: ScoreBreakdown = {
    sourceDiversity,
    velocity,
    credibility,
    category,
    recency,
    manual,
  };

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const scoreMillis = Math.round(score * 1000);

  return { score, scoreMillis, breakdown };
}

/**
 * Update cluster ranking in database
 */
export async function updateClusterRanking(clusterId: string): Promise<void> {
  const cluster = await db.storyCluster.findUnique({
    where: { id: clusterId },
    include: { signals: { include: { rawSignal: true } } },
  });

  if (!cluster) return;

  const { scoreMillis, breakdown } = await computeImportanceScore(cluster);

  await db.storyCluster.update({
    where: { id: clusterId },
    data: {
      importanceScore: scoreMillis,
      scoreBreakdown: breakdown as unknown as Prisma.InputJsonValue,
      lastSeenAt: new Date(),
    },
  });
}

/**
 * Recompute rankings for all active clusters
 */
export async function recomputeAllRankings(): Promise<number> {
  const activeClusters = await db.storyCluster.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });

  let updated = 0;

  for (const cluster of activeClusters) {
    try {
      await updateClusterRanking(cluster.id);
      updated++;
    } catch (error) {
      console.error(`Failed to update ranking for cluster ${cluster.id}:`, error);
    }
  }

  return updated;
}

/**
 * Get credibility weight for a domain (with caching)
 */
const credibilityCache = new Map<string, number>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let cacheTime = 0;

export async function getCredibilityWeight(domain: string): Promise<number> {
  // Refresh cache if expired
  if (Date.now() - cacheTime > CACHE_TTL) {
    const allCredibilities = await db.sourceCredibility.findMany();
    credibilityCache.clear();
    for (const c of allCredibilities) {
      credibilityCache.set(c.sourceDomain, c.weight);
    }
    cacheTime = Date.now();
  }

  return credibilityCache.get(domain) ?? 0.5; // Default 0.5
}
