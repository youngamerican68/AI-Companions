import {
  SourceConnector,
  SourceConfig,
  FetchResult,
  SourceError,
} from './types';
import { SourceType } from '@prisma/client';

/**
 * X (Twitter) connector - STUB implementation
 *
 * To implement fully, you would need:
 * 1. X API v2 credentials (Bearer token or OAuth2)
 * 2. Search/stream endpoint access
 * 3. Account monitoring for official platform accounts
 *
 * API Docs: https://developer.twitter.com/en/docs/twitter-api
 *
 * Note: X API access has become increasingly restricted and expensive.
 * Consider using RSS feeds from https://nitter.net/ as an alternative.
 */
export class XConnector implements SourceConnector {
  readonly name = 'x';
  readonly sourceType = SourceType.SOCIAL;

  canHandle(config: SourceConfig): boolean {
    return (
      config.type === SourceType.SOCIAL &&
      (config.url.includes('twitter.com') ||
        config.url.includes('x.com') ||
        config.options?.platform === 'x' ||
        config.options?.platform === 'twitter')
    );
  }

  async fetch(config: SourceConfig): Promise<FetchResult> {
    // STUB: Return empty result with informative error
    const errors: SourceError[] = [
      {
        message:
          'X (Twitter) connector is a stub. Implement with X API credentials to enable.',
        code: 'NOT_IMPLEMENTED',
        source: config.name,
        url: config.url,
      },
    ];

    return {
      items: [],
      errors,
      metadata: {
        fetchedAt: new Date(),
        itemCount: 0,
        durationMs: 0,
      },
    };
  }
}

/**
 * Example of how a real X fetch might look:
 *
 * async searchTweets(query: string): Promise<RawFetchedItem[]> {
 *   const response = await fetch(
 *     `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&tweet.fields=created_at,author_id,text&max_results=100`,
 *     {
 *       headers: {
 *         Authorization: `Bearer ${this.bearerToken}`,
 *       },
 *     }
 *   );
 *
 *   const data = await response.json();
 *
 *   return data.data.map((tweet: any) => ({
 *     externalId: tweet.id,
 *     sourceUrl: `https://x.com/i/status/${tweet.id}`,
 *     rawText: tweet.text,
 *     publishedAt: new Date(tweet.created_at),
 *     rawPayload: tweet,
 *     rawContentType: 'tweet',
 *   }));
 * }
 */

export const xConnector = new XConnector();
