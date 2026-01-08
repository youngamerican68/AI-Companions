import { NextRequest, NextResponse } from 'next/server';
import { runIngestCycle } from '@/lib/pipeline/runner';
import { isQueueModeEnabled } from '@/lib/env';

// Force Node.js runtime
export const runtime = 'nodejs';

// Increase timeout for ingest operations
export const maxDuration = 60; // 60 seconds (Vercel Pro limit)

/**
 * POST /api/ingest
 *
 * Trigger an ingestion cycle.
 * Protected by INGEST_SECRET token.
 *
 * Usage:
 * - Manual trigger: POST with Authorization header
 * - Vercel Cron: Configure in vercel.json with CRON_SECRET
 */
export async function POST(request: NextRequest) {
  try {
    // Validate authorization
    const authHeader = request.headers.get('authorization');
    const ingestSecret = process.env.INGEST_SECRET;
    const cronSecret = process.env.CRON_SECRET;

    // Check for Bearer token (manual trigger or Vercel Cron)
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const isValidIngestSecret = ingestSecret && token === ingestSecret;
      const isValidCronSecret = cronSecret && token === cronSecret;

      if (!isValidIngestSecret && !isValidCronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    // Check for x-cron-secret header
    else if (ingestSecret && request.headers.get('x-cron-secret') === ingestSecret) {
      // Valid
    }
    // Check query param for legacy support
    else {
      const url = new URL(request.url);
      const secretParam = url.searchParams.get('secret');
      if (!ingestSecret || secretParam !== ingestSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    console.log('[Ingest] Starting ingest cycle...');

    // Run the ingest cycle
    const result = await runIngestCycle();

    return NextResponse.json({
      runId: result.runId,
      status: 'completed',
      mode: isQueueModeEnabled() ? 'queue' : 'direct',
      signalsFetched: result.signalsFetched,
      signalsAccepted: result.signalsAccepted,
      signalsRejected: result.signalsRejected,
      errorCount: result.errors.length,
      durationMs: result.durationMs,
    });
  } catch (error) {
    console.error('[Ingest] Error:', error);
    return NextResponse.json(
      {
        error: 'Ingest failed',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ingest
 *
 * Get recent ingest run history
 */
export async function GET() {
  try {
    const { db } = await import('@/lib/db');

    const runs = await db.ingestRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      runs: runs.map((run) => ({
        id: run.id,
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() || null,
        signalsFetched: run.signalsFetched,
        signalsAccepted: run.signalsAccepted,
        signalsRejected: run.signalsRejected,
        errorCount: Array.isArray(run.errors) ? run.errors.length : 0,
      })),
    });
  } catch (error) {
    console.error('[Ingest] History error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ingest history' },
      { status: 500 }
    );
  }
}
