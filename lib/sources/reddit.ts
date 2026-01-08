import {
  SourceConnector,
  SourceConfig,
  FetchResult,
  SourceError,
} from './types';
import { SourceType } from '@prisma/client';

/**
 * Reddit connector - STUB implementation
 *
 * To implement fully, you would need:
 * 1. Reddit API credentials (client_id, client_secret)
 * 2. OAuth2 authentication flow
 * 3. Subreddit monitoring (r/CharacterAI, r/replika, etc.)
 *
 * API Docs: https://www.reddit.com/dev/api
 */
export class RedditConnector implements SourceConnector {
  readonly name = 'reddit';
  readonly sourceType = SourceType.SOCIAL;

  canHandle(config: SourceConfig): boolean {
    return (
      config.type === SourceType.SOCIAL &&
      (config.url.includes('reddit.com') || config.options?.platform === 'reddit')
    );
  }

  async fetch(config: SourceConfig): Promise<FetchResult> {
    // STUB: Return empty result with informative error
    const errors: SourceError[] = [
      {
        message:
          'Reddit connector is a stub. Implement with Reddit API credentials to enable.',
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
 * Example of how a real Reddit fetch might look:
 *
 * async fetchSubreddit(subreddit: string): Promise<RawFetchedItem[]> {
 *   const token = await this.getAccessToken();
 *
 *   const response = await fetch(
 *     `https://oauth.reddit.com/r/${subreddit}/hot?limit=50`,
 *     {
 *       headers: {
 *         Authorization: `Bearer ${token}`,
 *         'User-Agent': 'AI-Companions-Watch/1.0',
 *       },
 *     }
 *   );
 *
 *   const data = await response.json();
 *
 *   return data.data.children.map((post: any) => ({
 *     externalId: post.data.id,
 *     sourceUrl: `https://reddit.com${post.data.permalink}`,
 *     title: post.data.title,
 *     author: post.data.author,
 *     publishedAt: new Date(post.data.created_utc * 1000),
 *     rawText: post.data.selftext || post.data.title,
 *     rawPayload: post.data,
 *     rawContentType: 'reddit_post',
 *   }));
 * }
 */

export const redditConnector = new RedditConnector();
