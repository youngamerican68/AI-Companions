import { timeAgo } from '@/lib/time';
import { LinkList } from './LinkList';
import type { Category } from '@prisma/client';

interface Signal {
  id: string;
  title: string | null;
  url: string;
  imageUrl: string | null;
  sourceName: string;
  sourceDomain: string;
  publishedAt: string | null;
  createdAt: string;
}

interface Platform {
  slug: string;
  name: string;
}

interface ClusterCardProps {
  cluster: {
    id: string;
    headline: string;
    contextSummary: string;
    categories: Category[];
    platforms: Platform[];
    signalCount: number;
    lastSignalAt: string;
    signals: Signal[];
  };
  isTopStory?: boolean;
}

// Format category for display
function formatCategory(category: Category): string {
  const labels: Record<Category, string> = {
    PRODUCT_UPDATE: 'Product',
    MONETIZATION_CHANGE: 'Pricing',
    SAFETY_YOUTH_RISK: 'Safety',
    NSFW_CONTENT_POLICY: 'Content Policy',
    CULTURAL_TREND: 'Culture',
    REGULATORY_LEGAL: 'Regulatory',
    BUSINESS_FUNDING: 'Business',
  };
  return labels[category] || category;
}

export function ClusterCard({ cluster, isTopStory = false }: ClusterCardProps) {
  // Get the lead signal (first one)
  const leadSignal = cluster.signals[0];
  const otherSignals = cluster.signals.slice(1);

  // Find first available thumbnail from signals
  const thumbnailUrl = cluster.signals.find((s) => s.imageUrl)?.imageUrl;

  return (
    <article className={`tm-story ${isTopStory ? 'tm-top-story' : ''}`}>
      <div className="tm-story-content">
        <div className="tm-story-text">
          {/* Lead source */}
          {leadSignal && (
            <div className="tm-lead-source">{leadSignal.sourceName}:</div>
          )}

          {/* Headline */}
          <h2 className="tm-headline">
            <a
              href={leadSignal?.url || '#'}
              target="_blank"
              rel="noopener noreferrer"
            >
              {cluster.headline}
            </a>
          </h2>

          {/* Summary */}
          {cluster.contextSummary && (
            <p className="tm-summary">{cluster.contextSummary}</p>
          )}

          {/* More sources - inline Techmeme style */}
          <LinkList signals={otherSignals} />
        </div>

        {/* Thumbnail */}
        {thumbnailUrl && (
          <a
            href={leadSignal?.url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="tm-thumbnail"
          >
            <img
              src={thumbnailUrl}
              alt=""
              loading="lazy"
              onError={(e) => {
                // Hide broken images
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).parentElement!.style.display = 'none';
              }}
            />
          </a>
        )}
      </div>

      {/* Metadata row */}
      <div className="tm-categories">
        {/* Time */}
        <span className="tm-time">{timeAgo(cluster.lastSignalAt)}</span>

        {/* Categories */}
        {cluster.categories.length > 0 && (
          <>
            <span className="tm-more-sep">|</span>
            {cluster.categories.map((cat) => (
              <span key={cat} className="tm-category">
                {formatCategory(cat)}
              </span>
            ))}
          </>
        )}

        {/* Platforms */}
        {cluster.platforms.length > 0 && (
          <>
            <span className="tm-more-sep">|</span>
            {cluster.platforms.map((platform) => (
              <a
                key={platform.slug}
                href={`/?platform=${platform.slug}`}
                className="tm-platform-tag"
              >
                {platform.name}
              </a>
            ))}
          </>
        )}
      </div>
    </article>
  );
}
