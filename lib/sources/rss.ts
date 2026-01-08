import Parser from 'rss-parser';
import pLimit from 'p-limit';
import {
  SourceConnector,
  SourceConfig,
  FetchResult,
  RawFetchedItem,
  SourceError,
} from './types';
import { SourceType } from '@prisma/client';
import { truncateText, extractDomain } from '@/lib/hash';
import { parseDate } from '@/lib/time';

const MAX_TEXT_LENGTH = 20000;
const FETCH_TIMEOUT = 30000;

/**
 * RSS Feed connector - fully functional implementation
 */
export class RSSConnector implements SourceConnector {
  readonly name = 'rss';
  readonly sourceType = SourceType.MEDIA;

  private parser: Parser;
  private limiter: ReturnType<typeof pLimit>;

  constructor(concurrency = 3) {
    this.parser = new Parser({
      timeout: FETCH_TIMEOUT,
      headers: {
        'User-Agent': 'AI-Companions-Watch/1.0 (+https://github.com/ai-companions-watch)',
        Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml',
      },
      customFields: {
        item: [
          ['content:encoded', 'contentEncoded'],
          ['dc:creator', 'dcCreator'],
          ['media:content', 'mediaContent'],
        ],
      },
    });

    // Rate limiting: default 3 concurrent requests
    this.limiter = pLimit(concurrency);
  }

  canHandle(config: SourceConfig): boolean {
    // Handle RSS feeds by checking URL pattern or explicit type
    const isRssUrl =
      config.url.includes('/rss') ||
      config.url.includes('/feed') ||
      config.url.endsWith('.xml') ||
      config.url.includes('atom');

    return config.type === SourceType.MEDIA || isRssUrl;
  }

  async fetch(config: SourceConfig): Promise<FetchResult> {
    const startTime = Date.now();
    const items: RawFetchedItem[] = [];
    const errors: SourceError[] = [];

    try {
      const feed = await this.limiter(() => this.fetchFeed(config.url));

      for (const item of feed.items) {
        try {
          const fetchedItem = this.parseItem(item, config, feed);
          items.push(fetchedItem);
        } catch (error) {
          errors.push({
            message: `Failed to parse item: ${(error as Error).message}`,
            source: config.name,
            url: item.link,
            cause: error,
          });
        }
      }
    } catch (error) {
      errors.push({
        message: `Failed to fetch feed: ${(error as Error).message}`,
        code: 'FETCH_ERROR',
        source: config.name,
        url: config.url,
        cause: error,
      });
    }

    return {
      items,
      errors,
      metadata: {
        fetchedAt: new Date(),
        itemCount: items.length,
        durationMs: Date.now() - startTime,
      },
    };
  }

  private async fetchFeed(url: string): Promise<Parser.Output<Record<string, unknown>>> {
    return this.parser.parseURL(url);
  }

  private parseItem(
    item: Parser.Item & Record<string, unknown>,
    config: SourceConfig,
    feed: Parser.Output<Record<string, unknown>>
  ): RawFetchedItem {
    // Extract text content from various possible fields
    const contentParts: string[] = [];

    if (item.title) {
      contentParts.push(item.title);
    }

    // Try to get full content
    const content =
      (item.contentEncoded as string) ||
      item.content ||
      item['content:encoded'] ||
      item.description ||
      item.summary ||
      '';

    if (content) {
      // Strip HTML tags for text extraction
      const textContent = this.stripHtml(String(content));
      contentParts.push(textContent);
    }

    const rawText = truncateText(contentParts.join('\n\n'), MAX_TEXT_LENGTH);

    // Parse published date
    const publishedAt = parseDate(
      item.pubDate || item.isoDate || item.published || item.date
    );

    // Get author - use type casting for dynamic RSS fields
    const author =
      (item as Record<string, unknown>).creator ||
      item.author ||
      (item.dcCreator as string) ||
      item['dc:creator'] ||
      (feed as unknown as Record<string, unknown>).creator ||
      undefined;

    return {
      externalId: (item.guid || item.id || item.link) as string | undefined,
      sourceUrl: item.link || config.url,
      title: item.title?.slice(0, 500),
      author: typeof author === 'string' ? author : undefined,
      publishedAt: publishedAt || undefined,
      rawText,
      rawPayload: {
        ...item,
        feedTitle: feed.title,
        feedLink: feed.link,
        feedDescription: feed.description,
      },
      rawContentType: 'rss_item',
    };
  }

  private stripHtml(html: string): string {
    // Simple HTML stripping - good enough for RSS content
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// Export singleton instance
export const rssConnector = new RSSConnector();
