import { SourceType } from '@prisma/client';

/**
 * Raw item fetched from a source before processing
 */
export interface RawFetchedItem {
  /** Unique identifier from the source (e.g., RSS guid) */
  externalId?: string;

  /** Source URL of the item */
  sourceUrl: string;

  /** Title of the item */
  title?: string;

  /** Author/creator name */
  author?: string;

  /** Publication date */
  publishedAt?: Date;

  /** Raw text content */
  rawText?: string;

  /** Original raw payload as JSON */
  rawPayload: Record<string, unknown>;

  /** Content type identifier */
  rawContentType: string;
}

/**
 * Configuration for a source connector
 */
export interface SourceConfig {
  /** Human-readable name of the source */
  name: string;

  /** Source type */
  type: SourceType;

  /** Source URL or identifier */
  url: string;

  /** Whether this source is enabled */
  enabled: boolean;

  /** Rate limit in requests per second */
  rateLimit?: number;

  /** Additional source-specific configuration */
  options?: Record<string, unknown>;
}

/**
 * Result of a fetch operation
 */
export interface FetchResult {
  /** Items fetched from the source */
  items: RawFetchedItem[];

  /** Any errors that occurred */
  errors: SourceError[];

  /** Metadata about the fetch */
  metadata: {
    fetchedAt: Date;
    itemCount: number;
    durationMs: number;
  };
}

/**
 * Error from a source connector
 */
export interface SourceError {
  message: string;
  code?: string;
  source: string;
  url?: string;
  cause?: unknown;
}

/**
 * Interface for source connectors
 */
export interface SourceConnector {
  /** Name of the connector */
  readonly name: string;

  /** Type of source */
  readonly sourceType: SourceType;

  /**
   * Fetch items from the configured source
   */
  fetch(config: SourceConfig): Promise<FetchResult>;

  /**
   * Check if this connector can handle the given config
   */
  canHandle(config: SourceConfig): boolean;
}

/**
 * Registry of source connectors
 */
export interface ConnectorRegistry {
  register(connector: SourceConnector): void;
  getConnector(config: SourceConfig): SourceConnector | undefined;
  getAllConnectors(): SourceConnector[];
}

/**
 * Create a new connector registry
 */
export function createConnectorRegistry(): ConnectorRegistry {
  const connectors: SourceConnector[] = [];

  return {
    register(connector: SourceConnector): void {
      connectors.push(connector);
    },

    getConnector(config: SourceConfig): SourceConnector | undefined {
      return connectors.find((c) => c.canHandle(config));
    },

    getAllConnectors(): SourceConnector[] {
      return [...connectors];
    },
  };
}
