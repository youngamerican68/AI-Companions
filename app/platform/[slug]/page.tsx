import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { ClusterCard } from '@/components/ClusterCard';
import { timeAgo } from '@/lib/time';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Generate metadata for the page
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;

  const platform = await db.platform.findUnique({
    where: { slug },
    select: { name: true, description: true },
  });

  if (!platform) {
    return { title: 'Platform Not Found' };
  }

  return {
    title: `${platform.name} - AI Companions Watch`,
    description:
      platform.description ||
      `Latest news and updates about ${platform.name}`,
  };
}

// Fetch platform data
async function getPlatform(slug: string) {
  const platform = await db.platform.findUnique({
    where: { slug },
    include: {
      clusters: {
        where: {
          cluster: {
            status: 'ACTIVE',
          },
        },
        include: {
          cluster: {
            include: {
              signals: {
                take: 5,
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
                    select: { slug: true, name: true },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          cluster: {
            lastSignalAt: 'desc',
          },
        },
        take: 20,
      },
    },
  });

  return platform;
}

export default async function PlatformPage({ params }: PageProps) {
  const { slug } = await params;
  const platform = await getPlatform(slug);

  if (!platform) {
    notFound();
  }

  // Transform clusters for display
  const clusters = platform.clusters.map((cp) => ({
    id: cp.cluster.id,
    headline: cp.cluster.headline,
    contextSummary: cp.cluster.contextSummary,
    categories: cp.cluster.categories,
    platforms: cp.cluster.platforms.map((p) => p.platform),
    signalCount: cp.cluster.signals.length,
    lastSignalAt: cp.cluster.lastSignalAt.toISOString(),
    signals: cp.cluster.signals.map((s) => ({
      id: s.id,
      title: s.title,
      url: s.canonicalUrl,
      imageUrl: s.imageUrl || null,
      sourceName: s.rawSignal.sourceName,
      sourceDomain: s.rawSignal.sourceDomain,
      publishedAt: s.publishedAt?.toISOString() || null,
      createdAt: s.createdAt.toISOString(),
    })),
  }));

  const lastUpdated =
    clusters.length > 0 ? clusters[0].lastSignalAt : platform.updatedAt.toISOString();

  return (
    <div>
      {/* Platform Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">
              {platform.name}
            </h1>
            {platform.websiteUrl && (
              <a
                href={platform.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--accent)] hover:underline"
              >
                {platform.websiteUrl.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
          <span className="text-sm text-[var(--muted-foreground)]">
            Updated {timeAgo(lastUpdated)}
          </span>
        </div>

        {platform.description && (
          <p className="text-[var(--muted-foreground)] leading-relaxed">
            {platform.description}
          </p>
        )}

        {platform.policyNotes && (
          <div className="mt-4 p-4 bg-[var(--muted)] rounded-lg">
            <h3 className="text-sm font-semibold mb-2">Known Policy Changes</h3>
            <p className="text-sm text-[var(--muted-foreground)]">
              {platform.policyNotes}
            </p>
          </div>
        )}
      </div>

      {/* Recent Clusters */}
      <section>
        <h2 className="text-lg font-semibold mb-4 pb-2 border-b border-[var(--border)]">
          Recent Stories
        </h2>

        {clusters.length === 0 ? (
          <p className="text-center py-8 text-[var(--muted-foreground)]">
            No recent stories about {platform.name}.
          </p>
        ) : (
          <div>
            {clusters.map((cluster, index) => (
              <ClusterCard
                key={cluster.id}
                cluster={cluster}
                isTopStory={index === 0}
              />
            ))}
          </div>
        )}
      </section>

      {/* Back link */}
      <div className="mt-8 pt-4 border-t border-[var(--border)]">
        <a href="/" className="text-[var(--accent)] hover:underline">
          &larr; Back to all stories
        </a>
      </div>
    </div>
  );
}
