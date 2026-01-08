import { NextRequest, NextResponse } from 'next/server';
import { db, Prisma } from '@/lib/db';
import { getWindowStart } from '@/lib/time';
import { z } from 'zod';
import type { Category } from '@prisma/client';

// Force Node.js runtime for Buffer support
export const runtime = 'nodejs';

// =============================================================================
// Types
// =============================================================================

interface ClusterCursor {
  importanceScore: number;
  lastSignalAt: string;
  id: string;
}

// =============================================================================
// Query Validation
// =============================================================================

const QuerySchema = z.object({
  category: z.nativeEnum({
    PRODUCT_UPDATE: 'PRODUCT_UPDATE',
    MONETIZATION_CHANGE: 'MONETIZATION_CHANGE',
    SAFETY_YOUTH_RISK: 'SAFETY_YOUTH_RISK',
    NSFW_CONTENT_POLICY: 'NSFW_CONTENT_POLICY',
    CULTURAL_TREND: 'CULTURAL_TREND',
    REGULATORY_LEGAL: 'REGULATORY_LEGAL',
    BUSINESS_FUNDING: 'BUSINESS_FUNDING',
  } as const).optional(),
  platform: z.string().optional(),
  window: z.enum(['24h', '7d', '30d']).optional().default('7d'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

// =============================================================================
// Cursor Helpers
// =============================================================================

function encodeCursor(cluster: {
  importanceScore: number;
  lastSignalAt: Date;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      importanceScore: cluster.importanceScore,
      lastSignalAt: cluster.lastSignalAt.toISOString(),
      id: cluster.id,
    })
  ).toString('base64url');
}

function decodeCursor(cursor: string): ClusterCursor | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    return {
      importanceScore: decoded.importanceScore,
      lastSignalAt: decoded.lastSignalAt,
      id: decoded.id,
    };
  } catch {
    return null;
  }
}

function buildCursorWhere(cursor: ClusterCursor): Prisma.StoryClusterWhereInput {
  return {
    OR: [
      { importanceScore: { lt: cursor.importanceScore } },
      {
        importanceScore: cursor.importanceScore,
        lastSignalAt: { lt: new Date(cursor.lastSignalAt) },
      },
      {
        importanceScore: cursor.importanceScore,
        lastSignalAt: new Date(cursor.lastSignalAt),
        id: { lt: cursor.id },
      },
    ],
  };
}

// =============================================================================
// GET Handler
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse and validate query params
    const parsed = QuerySchema.safeParse({
      category: searchParams.get('category') || undefined,
      platform: searchParams.get('platform') || undefined,
      window: searchParams.get('window') || undefined,
      cursor: searchParams.get('cursor') || undefined,
      limit: searchParams.get('limit') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { category, platform, window, cursor, limit } = parsed.data;

    // Build where clause
    const where: Prisma.StoryClusterWhereInput = {
      status: 'ACTIVE',
      lastSignalAt: { gte: getWindowStart(window) },
    };

    // Category filter
    if (category) {
      where.categories = { has: category as Category };
    }

    // Platform filter via junction table
    if (platform) {
      where.platforms = {
        some: {
          platform: { slug: platform },
        },
      };
    }

    // Cursor pagination
    if (cursor) {
      const decodedCursor = decodeCursor(cursor);
      if (decodedCursor) {
        where.AND = [buildCursorWhere(decodedCursor)];
      }
    }

    // Fetch clusters with signals
    const clusters = await db.storyCluster.findMany({
      where,
      orderBy: [
        { importanceScore: 'desc' },
        { lastSignalAt: 'desc' },
        { id: 'desc' },
      ],
      take: limit + 1, // Fetch one extra to check if there are more
      include: {
        signals: {
          take: 10, // Limit signals per cluster
          orderBy: { createdAt: 'desc' },
          include: {
            rawSignal: {
              select: {
                sourceName: true,
                sourceDomain: true,
                sourceUrl: true,
              },
            },
          },
        },
        platforms: {
          include: {
            platform: {
              select: {
                slug: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Check if there are more results
    const hasMore = clusters.length > limit;
    const returnedClusters = hasMore ? clusters.slice(0, limit) : clusters;

    // Generate next cursor
    const nextCursor =
      hasMore && returnedClusters.length > 0
        ? encodeCursor(returnedClusters[returnedClusters.length - 1])
        : null;

    // Transform response
    const response = {
      clusters: returnedClusters.map((cluster) => ({
        id: cluster.id,
        headline: cluster.headline,
        contextSummary: cluster.contextSummary,
        categories: cluster.categories,
        platforms: cluster.platforms.map((cp) => cp.platform),
        importanceScore: cluster.importanceScore,
        scoreBreakdown: cluster.scoreBreakdown,
        signalCount: cluster.signals.length,
        firstSeenAt: cluster.firstSeenAt.toISOString(),
        lastSignalAt: cluster.lastSignalAt.toISOString(),
        signals: cluster.signals.map((signal) => ({
          id: signal.id,
          title: signal.title,
          url: signal.canonicalUrl,
          imageUrl: signal.imageUrl || null,
          sourceName: signal.rawSignal.sourceName,
          sourceDomain: signal.rawSignal.sourceDomain,
          publishedAt: signal.publishedAt?.toISOString() || null,
          createdAt: signal.createdAt.toISOString(),
        })),
      })),
      nextCursor,
      hasMore,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Clusters API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
