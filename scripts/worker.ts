/**
 * BullMQ Worker for AI Companions Watch
 *
 * Processes background jobs when REDIS_URL is configured.
 * Run with: pnpm worker
 *
 * Currently falls back to direct mode - full BullMQ implementation
 * can be added when queue mode is needed.
 */

import { runIngestCycle } from '../lib/pipeline/runner';
import { isQueueModeEnabled } from '../lib/env';

// =============================================================================
// Configuration
// =============================================================================

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// Worker Implementation
// =============================================================================

async function runWorker() {
  console.log('='.repeat(60));
  console.log('AI Companions Watch - Worker');
  console.log('='.repeat(60));
  console.log('');

  if (isQueueModeEnabled()) {
    console.log('Mode: Queue (BullMQ)');
    console.log('Redis URL:', process.env.REDIS_URL?.replace(/\/\/.*@/, '//***@'));
    console.log('');

    // TODO: Implement full BullMQ worker
    // For now, fall back to polling mode
    console.log('Note: Full BullMQ implementation pending.');
    console.log('Running in polling mode instead.');
  } else {
    console.log('Mode: Direct (polling)');
  }

  console.log(`Poll interval: ${POLL_INTERVAL_MS / 1000}s`);
  console.log('');
  console.log('Starting worker loop...');
  console.log('');

  // Polling loop
  while (true) {
    try {
      console.log(`[${new Date().toISOString()}] Running ingest cycle...`);

      const result = await runIngestCycle();

      console.log(
        `[${new Date().toISOString()}] Completed:`,
        `fetched=${result.signalsFetched}`,
        `accepted=${result.signalsAccepted}`,
        `rejected=${result.signalsRejected}`,
        `errors=${result.errors.length}`,
        `duration=${result.durationMs}ms`
      );

      if (result.errors.length > 0) {
        console.log('Errors:');
        for (const error of result.errors.slice(0, 5)) {
          console.log(`  - ${error.source}: ${error.message}`);
        }
        if (result.errors.length > 5) {
          console.log(`  ... and ${result.errors.length - 5} more`);
        }
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Worker error:`, error);
    }

    console.log(`[${new Date().toISOString()}] Sleeping for ${POLL_INTERVAL_MS / 1000}s...`);
    console.log('');

    await sleep(POLL_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Graceful Shutdown
// =============================================================================

let isShuttingDown = false;

function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// =============================================================================
// Main
// =============================================================================

runWorker().catch((error) => {
  console.error('Worker failed to start:', error);
  process.exit(1);
});
