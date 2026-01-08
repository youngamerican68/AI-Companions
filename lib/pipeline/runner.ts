import pMap from 'p-map';
import { db } from '@/lib/db';
import { getEnv, isQueueModeEnabled } from '@/lib/env';
import {
  createIngestRun,
  updateIngestRun,
  fetchFromSources,
  processFetchedItems,
  buildSourceConfigMap,
  type IngestResult,
  type IngestError,
  type CreatedSignal,
} from './ingest';
import { normalizeAndUpdateSignal, linkSignalToPlatforms } from './normalize';
import { clusterAndRank } from './cluster';
import { recomputeAllRankings } from './rank';
import type { IngestRun } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

export interface PipelineRunner {
  runIngestCycle(): Promise<IngestResult>;
}

// =============================================================================
// Direct Mode (Vercel, no Redis)
// =============================================================================

class DirectPipelineRunner implements PipelineRunner {
  private readonly maxItems: number;
  private readonly timeoutMs: number;
  private readonly llmConcurrency: number;

  constructor() {
    const env = getEnv();
    this.maxItems = env.DIRECT_MODE_MAX_ITEMS;
    this.timeoutMs = env.DIRECT_MODE_TIMEOUT_MS;
    this.llmConcurrency = env.DIRECT_MODE_LLM_CONCURRENCY;
  }

  async runIngestCycle(): Promise<IngestResult> {
    const startTime = Date.now();
    const errors: IngestError[] = [];

    // Create run record
    const run = await createIngestRun();

    try {
      // 1. Fetch from sources (cap at maxItems)
      console.log(`[Direct] Fetching from sources (max ${this.maxItems} items)...`);
      const { items, errors: fetchErrors } = await fetchFromSources(this.maxItems);
      errors.push(...fetchErrors);

      // 2. Store raw signals (dedupe)
      console.log(`[Direct] Processing ${items.length} fetched items...`);
      const sourceConfigs = buildSourceConfigMap();
      const { created, duplicates } = await processFetchedItems(items, sourceConfigs);
      console.log(`[Direct] Created ${created.length} signals, ${duplicates} duplicates`);

      // 3. Normalize with LLM (bounded concurrency)
      const normalized = await this.normalizeSignals(created, startTime);

      // 4. Cluster and rank (time-bounded)
      await this.clusterSignals(normalized, startTime);

      // 5. Sweep stale clusters
      await this.sweepStaleClusters();

      // 6. Recompute rankings for active clusters
      await recomputeAllRankings();

      // Update run record
      const result: IngestResult = {
        runId: run.id,
        signalsFetched: items.length,
        signalsAccepted: normalized.length,
        signalsRejected: created.length - normalized.length,
        errors,
        durationMs: Date.now() - startTime,
      };

      await updateIngestRun(run.id, {
        status: 'COMPLETED',
        signalsFetched: result.signalsFetched,
        signalsAccepted: result.signalsAccepted,
        signalsRejected: result.signalsRejected,
        errors,
      });

      console.log(`[Direct] Completed in ${result.durationMs}ms`);
      return result;
    } catch (error) {
      console.error('[Direct] Pipeline error:', error);

      await updateIngestRun(run.id, {
        status: 'FAILED',
        signalsFetched: 0,
        signalsAccepted: 0,
        signalsRejected: 0,
        errors: [
          ...errors,
          {
            source: 'pipeline',
            message: (error as Error).message,
            code: 'PIPELINE_ERROR',
          },
        ],
      });

      throw error;
    }
  }

  private async normalizeSignals(
    signals: CreatedSignal[],
    startTime: number
  ): Promise<CreatedSignal[]> {
    const normalized: CreatedSignal[] = [];

    await pMap(
      signals,
      async (signal) => {
        // Time check
        if (Date.now() - startTime > this.timeoutMs - 10000) {
          return;
        }

        try {
          const output = await normalizeAndUpdateSignal({
            signalId: signal.id,
            title: signal.title,
            url: signal.url,
            sourceName: signal.sourceName,
            publishedAt: signal.publishedAt,
            rawText: signal.rawText,
          });

          if (output.success && output.entities?.platforms) {
            await linkSignalToPlatforms(signal.id, output.entities.platforms);
            normalized.push(signal);
          }
        } catch (error) {
          console.error(`[Direct] Normalize error for ${signal.id}:`, error);
        }
      },
      { concurrency: this.llmConcurrency, stopOnError: false }
    );

    return normalized;
  }

  private async clusterSignals(
    signals: CreatedSignal[],
    startTime: number
  ): Promise<void> {
    for (const signal of signals) {
      // Time check
      if (Date.now() - startTime > this.timeoutMs - 5000) {
        console.log('[Direct] Time budget exceeded, stopping clustering');
        break;
      }

      try {
        await clusterAndRank(signal.id);
      } catch (error) {
        console.error(`[Direct] Cluster error for ${signal.id}:`, error);
      }
    }
  }

  private async sweepStaleClusters(): Promise<void> {
    const env = getEnv();
    const cutoff = new Date(
      Date.now() - env.CLUSTER_ACTIVE_DAYS * 24 * 60 * 60 * 1000
    );

    const result = await db.storyCluster.updateMany({
      where: {
        status: 'ACTIVE',
        lastSignalAt: { lt: cutoff },
      },
      data: { status: 'STALE' },
    });

    if (result.count > 0) {
      console.log(`[Direct] Marked ${result.count} clusters as stale`);
    }
  }
}

// =============================================================================
// Queue Mode (BullMQ when Redis is available)
// =============================================================================

class QueuePipelineRunner implements PipelineRunner {
  async runIngestCycle(): Promise<IngestResult> {
    // In queue mode, we just enqueue jobs and return immediately
    // The actual work is done by the worker process

    const run = await createIngestRun();
    const startTime = Date.now();

    try {
      // For now, fall back to direct mode
      // TODO: Implement BullMQ job enqueueing
      console.log('[Queue] Falling back to direct mode (BullMQ not yet implemented)');

      const directRunner = new DirectPipelineRunner();
      return directRunner.runIngestCycle();
    } catch (error) {
      await updateIngestRun(run.id, {
        status: 'FAILED',
        signalsFetched: 0,
        signalsAccepted: 0,
        signalsRejected: 0,
        errors: [
          {
            source: 'queue',
            message: (error as Error).message,
            code: 'QUEUE_ERROR',
          },
        ],
      });

      throw error;
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

let _runner: PipelineRunner | undefined;

/**
 * Get the appropriate pipeline runner based on configuration
 */
export function getPipelineRunner(): PipelineRunner {
  if (!_runner) {
    _runner = isQueueModeEnabled()
      ? new QueuePipelineRunner()
      : new DirectPipelineRunner();
  }
  return _runner;
}

/**
 * Reset the runner (useful for testing)
 */
export function resetPipelineRunner(): void {
  _runner = undefined;
}

/**
 * Run an ingest cycle using the configured runner
 */
export async function runIngestCycle(): Promise<IngestResult> {
  return getPipelineRunner().runIngestCycle();
}
