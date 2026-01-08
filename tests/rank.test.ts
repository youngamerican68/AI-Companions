import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the database and env
vi.mock('@/lib/db', () => ({
  db: {
    sourceCredibility: {
      findMany: vi.fn().mockResolvedValue([
        { sourceDomain: 'theverge.com', weight: 0.9 },
        { sourceDomain: 'reddit.com', weight: 0.5 },
      ]),
    },
    storyCluster: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('@/lib/env', () => ({
  getEnv: () => ({
    RANKING_MAX_DOMAINS: 6,
    RANKING_RECENCY_DECAY_HOURS: 24,
  }),
}));

// Import after mocks
import { computeImportanceScore, type ScoreBreakdown } from '@/lib/pipeline/rank';

describe('Ranking Algorithm', () => {
  describe('computeImportanceScore', () => {
    it('should compute source diversity score with diminishing returns', async () => {
      const cluster = createMockCluster({
        signals: [
          createMockSignal('theverge.com'),
          createMockSignal('wired.com'),
          createMockSignal('techcrunch.com'),
        ],
      });

      const result = await computeImportanceScore(asMockCluster(cluster));

      // 3 unique domains * 2.0 = 6.0
      expect(result.breakdown.sourceDiversity).toBe(6.0);
    });

    it('should cap source diversity at max domains', async () => {
      const cluster = createMockCluster({
        signals: [
          createMockSignal('domain1.com'),
          createMockSignal('domain2.com'),
          createMockSignal('domain3.com'),
          createMockSignal('domain4.com'),
          createMockSignal('domain5.com'),
          createMockSignal('domain6.com'),
          createMockSignal('domain7.com'),
          createMockSignal('domain8.com'),
        ],
      });

      const result = await computeImportanceScore(asMockCluster(cluster));

      // Capped at 6 * 2.0 = 12.0
      expect(result.breakdown.sourceDiversity).toBe(12.0);
    });

    it('should use log-scaled velocity to prevent spam', async () => {
      const now = Date.now();
      const cluster = createMockCluster({
        signals: [
          createMockSignal('reddit.com', now - 1000), // 1 second ago
          createMockSignal('reddit.com', now - 2000), // 2 seconds ago
          createMockSignal('reddit.com', now - 3000), // 3 seconds ago
        ],
      });

      const result = await computeImportanceScore(asMockCluster(cluster));

      // log1p(3) * 3.0 = ~4.16
      expect(result.breakdown.velocity).toBeCloseTo(Math.log1p(3) * 3.0, 1);
    });

    it('should apply category weights correctly', async () => {
      const clusterSafety = createMockCluster({
        categories: ['SAFETY_YOUTH_RISK'],
      });

      const clusterProduct = createMockCluster({
        categories: ['PRODUCT_UPDATE'],
      });

      const safeyResult = await computeImportanceScore(asMockCluster(clusterSafety));
      const productResult = await computeImportanceScore(asMockCluster(clusterProduct));

      // Safety: 1.5 * 2.0 = 3.0
      expect(safeyResult.breakdown.category).toBe(3.0);

      // Product: 1.0 * 2.0 = 2.0
      expect(productResult.breakdown.category).toBe(2.0);
    });

    it('should use max category weight, not sum', async () => {
      const cluster = createMockCluster({
        categories: ['SAFETY_YOUTH_RISK', 'REGULATORY_LEGAL', 'PRODUCT_UPDATE'],
      });

      const result = await computeImportanceScore(asMockCluster(cluster));

      // Max(1.5, 1.5, 1.0) * 2.0 = 3.0
      expect(result.breakdown.category).toBe(3.0);
    });

    it('should apply recency decay over time', async () => {
      const now = Date.now();

      const freshCluster = createMockCluster({
        lastSignalAt: new Date(now - 1 * 60 * 60 * 1000), // 1 hour ago
      });

      const oldCluster = createMockCluster({
        lastSignalAt: new Date(now - 12 * 60 * 60 * 1000), // 12 hours ago
      });

      const freshResult = await computeImportanceScore(asMockCluster(freshCluster));
      const oldResult = await computeImportanceScore(asMockCluster(oldCluster));

      expect(freshResult.breakdown.recency).toBeGreaterThan(
        oldResult.breakdown.recency
      );
    });

    it('should apply manual boost multiplier', async () => {
      const unboosted = createMockCluster({ manualBoost: 0 });
      const boosted = createMockCluster({ manualBoost: 2 });

      const unboostedResult = await computeImportanceScore(asMockCluster(unboosted));
      const boostedResult = await computeImportanceScore(asMockCluster(boosted));

      expect(unboostedResult.breakdown.manual).toBe(0);
      expect(boostedResult.breakdown.manual).toBe(10); // 2 * 5.0
    });

    it('should return scaled score in millis', async () => {
      const cluster = createMockCluster({
        signals: [createMockSignal('theverge.com')],
      });

      const result = await computeImportanceScore(asMockCluster(cluster));

      expect(result.scoreMillis).toBe(Math.round(result.score * 1000));
    });
  });
});

// =============================================================================
// Test Helpers
// =============================================================================

// Minimal mock types for testing - cast through unknown to bypass Prisma types
interface MockSignal {
  id: string;
  createdAt: Date;
  rawSignal: { sourceDomain: string };
}

interface MockCluster {
  id: string;
  categories: string[];
  lastSignalAt: Date;
  manualBoost: number;
  signals: MockSignal[];
}

function createMockCluster(overrides: Partial<{
  signals: MockSignal[];
  categories: string[];
  lastSignalAt: Date;
  manualBoost: number;
}> = {}): MockCluster {
  return {
    id: 'cluster-1',
    categories: overrides.categories || ['PRODUCT_UPDATE'],
    lastSignalAt: overrides.lastSignalAt || new Date(),
    manualBoost: overrides.manualBoost || 0,
    signals: overrides.signals || [createMockSignal('theverge.com')],
  };
}

function createMockSignal(domain: string, createdAt?: number): MockSignal {
  return {
    id: `signal-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date(createdAt || Date.now()),
    rawSignal: {
      sourceDomain: domain,
    },
  };
}

// Helper to cast mock to expected type
function asMockCluster(mock: MockCluster) {
  return mock as unknown as Parameters<typeof computeImportanceScore>[0];
}
