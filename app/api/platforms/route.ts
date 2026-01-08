import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Force Node.js runtime
export const runtime = 'nodejs';

export async function GET() {
  try {
    // Get all platforms with cluster counts
    const platforms = await db.platform.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        websiteUrl: true,
        updatedAt: true,
        _count: {
          select: {
            clusters: {
              where: {
                cluster: {
                  status: 'ACTIVE',
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Get last signal time for each platform
    const platformStats = await Promise.all(
      platforms.map(async (platform) => {
        const lastCluster = await db.storyCluster.findFirst({
          where: {
            status: 'ACTIVE',
            platforms: {
              some: {
                platformId: platform.id,
              },
            },
          },
          orderBy: { lastSignalAt: 'desc' },
          select: { lastSignalAt: true },
        });

        return {
          id: platform.id,
          slug: platform.slug,
          name: platform.name,
          description: platform.description,
          websiteUrl: platform.websiteUrl,
          activeClusterCount: platform._count.clusters,
          lastUpdated: lastCluster?.lastSignalAt?.toISOString() || null,
        };
      })
    );

    return NextResponse.json({ platforms: platformStats });
  } catch (error) {
    console.error('Platforms API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
