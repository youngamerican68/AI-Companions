import {
  SourceConnector,
  SourceConfig,
  FetchResult,
  SourceError,
} from './types';
import { SourceType } from '@prisma/client';

/**
 * Discord connector - STUB implementation
 *
 * To implement fully, you would need:
 * 1. Discord Bot token with read access to announcement channels
 * 2. Guild (server) access for official platform Discord servers
 * 3. Webhook integration for real-time updates
 *
 * API Docs: https://discord.com/developers/docs
 *
 * Recommended approach:
 * - Create a Discord bot that joins official platform servers
 * - Monitor announcement channels for updates
 * - Filter for posts from verified roles/admins
 */
export class DiscordConnector implements SourceConnector {
  readonly name = 'discord';
  readonly sourceType = SourceType.PRODUCT;

  canHandle(config: SourceConfig): boolean {
    return (
      config.type === SourceType.PRODUCT &&
      (config.url.includes('discord.com') ||
        config.url.includes('discord.gg') ||
        config.options?.platform === 'discord')
    );
  }

  async fetch(config: SourceConfig): Promise<FetchResult> {
    // STUB: Return empty result with informative error
    const errors: SourceError[] = [
      {
        message:
          'Discord connector is a stub. Implement with Discord Bot token to enable.',
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
 * Example of how a real Discord fetch might look:
 *
 * async fetchChannelMessages(channelId: string): Promise<RawFetchedItem[]> {
 *   const response = await fetch(
 *     `https://discord.com/api/v10/channels/${channelId}/messages?limit=50`,
 *     {
 *       headers: {
 *         Authorization: `Bot ${this.botToken}`,
 *       },
 *     }
 *   );
 *
 *   const messages = await response.json();
 *
 *   return messages.map((msg: any) => ({
 *     externalId: msg.id,
 *     sourceUrl: `https://discord.com/channels/${msg.guild_id}/${channelId}/${msg.id}`,
 *     author: msg.author.username,
 *     publishedAt: new Date(msg.timestamp),
 *     rawText: msg.content,
 *     rawPayload: msg,
 *     rawContentType: 'discord_message',
 *   }));
 * }
 */

export const discordConnector = new DiscordConnector();
