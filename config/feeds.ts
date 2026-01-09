import { SourceType } from '@prisma/client';
import { SourceConfig } from '@/lib/sources/types';

/**
 * RSS Feed Configuration
 *
 * Add new feeds here to include them in the ingestion pipeline.
 * Each feed will be polled during ingest cycles.
 */
export const RSS_FEEDS: SourceConfig[] = [
  // ============================================================================
  // AI Newsletters (priority - checked first)
  // ============================================================================
  {
    name: 'AINews',
    type: SourceType.MEDIA,
    url: 'https://news.smol.ai/rss.xml',
    enabled: false, // Disabled - newsletter digest format doesn't work well with article-based aggregation
    rateLimit: 1,
  },

  // ============================================================================
  // Tech News - AI Coverage
  // ============================================================================
  {
    name: 'The Verge - AI',
    type: SourceType.MEDIA,
    url: 'https://www.theverge.com/ai-artificial-intelligence/rss/index.xml',
    enabled: true,
    rateLimit: 1,
  },
  {
    name: 'Wired - AI',
    type: SourceType.MEDIA,
    url: 'https://www.wired.com/feed/tag/ai/latest/rss',
    enabled: true,
    rateLimit: 1,
  },
  {
    name: 'TechCrunch - AI',
    type: SourceType.MEDIA,
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    enabled: true,
    rateLimit: 1,
  },
  {
    name: 'Ars Technica - Tech',
    type: SourceType.MEDIA,
    url: 'https://feeds.arstechnica.com/arstechnica/technology-lab',
    enabled: true,
    rateLimit: 1,
  },
  {
    name: 'MIT Technology Review - AI',
    type: SourceType.MEDIA,
    url: 'https://www.technologyreview.com/feed/',
    enabled: true,
    rateLimit: 1,
  },

  // ============================================================================
  // Regulatory / Policy Sources
  // ============================================================================
  {
    name: 'FTC - News',
    type: SourceType.REGULATORY,
    url: 'https://www.ftc.gov/news-events/rss/press-releases',
    enabled: true,
    rateLimit: 0.5, // Slower rate for gov sites
  },

  // ============================================================================
  // AI Companion Specific (when available)
  // ============================================================================
  {
    name: 'Character.AI Blog',
    type: SourceType.PRODUCT,
    url: 'https://blog.character.ai/rss/',
    enabled: true,
    rateLimit: 1,
  },

  // ============================================================================
  // Tech Blogs & Newsletters
  // ============================================================================
  {
    name: '404 Media',
    type: SourceType.MEDIA,
    url: 'https://www.404media.co/rss/',
    enabled: true,
    rateLimit: 1,
  },
  {
    name: 'Platformer',
    type: SourceType.MEDIA,
    url: 'https://www.platformer.news/rss/',
    enabled: true,
    rateLimit: 1,
  },

  // ============================================================================
  // Google News - Targeted Queries
  // ============================================================================
  {
    name: 'Google News - AI Companion',
    type: SourceType.MEDIA,
    url: 'https://news.google.com/rss/search?q=%22AI+companion%22&hl=en-US&gl=US&ceid=US:en',
    enabled: true,
    rateLimit: 0.5,
  },
  {
    name: 'Google News - AI Platforms',
    type: SourceType.MEDIA,
    url: 'https://news.google.com/rss/search?q=Replika+OR+%22Character.AI%22+OR+%22Nomi+AI%22+OR+Kindroid&hl=en-US&gl=US&ceid=US:en',
    enabled: true,
    rateLimit: 0.5,
  },
];

/**
 * Get all enabled RSS feeds
 */
export function getEnabledFeeds(): SourceConfig[] {
  return RSS_FEEDS.filter((feed) => feed.enabled);
}

/**
 * Get feeds by type
 */
export function getFeedsByType(type: SourceType): SourceConfig[] {
  return RSS_FEEDS.filter((feed) => feed.enabled && feed.type === type);
}
