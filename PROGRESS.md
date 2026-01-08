# AI Companions Watch - Progress Update

**Last Updated:** January 8, 2026

---

## Project Overview

A Techmeme-style intelligence platform for tracking AI companion ecosystem news (Replika, Character.AI, Nomi, etc.). Automatically ingests news, normalizes with LLM, clusters related stories, and ranks by importance.

---

## Current Status: E2E Verified ✅

### Build Status

| Check | Status |
|-------|--------|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx vitest run` | ✅ 32/32 passing |
| `npx next build` | ✅ Compiled successfully |
| E2E with Supabase | ✅ Verified January 8, 2026 |

---

## Architecture Summary

### Tech Stack
- **Framework:** Next.js 16.1.1 + TypeScript
- **Database:** PostgreSQL 16 + Prisma 6.2.1
- **Cache/Queue:** Redis 7 (optional, for BullMQ)
- **LLM:** OpenAI-compatible API (gpt-4o-mini default)

### Data Flow
```
RSS Feeds (8 configured)
    ↓
Fetch → Parse → SHA256 Dedup
    ↓
RawSignal (immutable)
    ↓
Signal (PENDING)
    ↓
LLM Normalize (entities, categories)
    ↓
Signal (ACCEPTED/REJECTED/FAILED)
    ↓
Two-Phase Clustering
  ├─ Phase 1: pg_trgm candidates
  └─ Phase 2: TF-IDF cosine similarity
    ↓
StoryCluster + Importance Ranking
    ↓
/api/clusters (cursor pagination)
```

### Database Models
| Model | Purpose |
|-------|---------|
| `RawSignal` | Immutable fetch artifact, SHA256 dedup |
| `Signal` | LLM-normalized, linked to platforms |
| `StoryCluster` | Grouped signals, ranked by importance |
| `Platform` | AI companion profiles (8 seeded) |
| `SourceCredibility` | Domain weights for ranking |
| `IngestRun` | Audit trail for ingestion cycles |

### API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ingest` | POST | Trigger ingestion cycle |
| `/api/ingest` | GET | View recent IngestRun history |
| `/api/clusters` | GET | Paginated clusters with filtering |
| `/api/platforms` | GET | Platform stats and counts |

---

## E2E Verification Results (January 8, 2026)

### Test Results
- [x] RawSignal rows created from RSS feeds (30 rows)
- [x] Signal rows have `normalizedAt` populated
- [x] Signal `ingestStatus` shows ACCEPTED/REJECTED distribution (3 accepted, 27 rejected)
- [x] StoryCluster rows created with rankings
- [x] `/api/clusters` returns clusters with valid `nextCursor`
- [x] Pagination is stable (no duplicates, no skips)

### Sample Accepted Stories
| Headline | Confidence | Platform |
|----------|------------|----------|
| Google and Character.AI Settle Lawsuits Over Teen Chatbot Death Cases | 0.85 | character-ai |
| Grok Generates Graphic Sexual Content, Raising Safety Concerns | 0.85 | - |
| California Proposes Ban on AI Chatbots in Kids' Toys | 0.70 | - |

### Setup Requirements Discovered
1. **pg_trgm extension required** - Must enable manually on Supabase: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
2. **Timeout adjustment** - Increase `DIRECT_MODE_TIMEOUT_MS` to 120000 for full pipeline completion
3. **2 RSS feeds broken** - The Verge AI (404) and FTC News (403) need updated URLs

---

## Key Configuration

### Environment Variables
| Variable | Default | Purpose |
|----------|---------|---------|
| `CLUSTER_SIMILARITY_THRESHOLD` | 0.4 | TF-IDF match threshold |
| `CLUSTER_TRGM_THRESHOLD` | 0.2 | pg_trgm candidate filter |
| `CLUSTER_ACTIVE_DAYS` | 7 | Days before cluster marked STALE |
| `DIRECT_MODE_MAX_ITEMS` | 30 | Items per ingest cycle |
| `DIRECT_MODE_TIMEOUT_MS` | 120000 | Pipeline timeout (increase for full completion) |
| `DIRECT_MODE_LLM_CONCURRENCY` | 3 | Parallel LLM calls |

### Seeded Data
- **Platforms (8):** Replika, Character.AI, Nomi, Kindroid, Paradot, Chai, CrushOn.AI, Janitor AI
- **Source Credibility (14):** Tiered weights from 0.4 (social) to 0.95 (regulatory)
- **RSS Feeds (8):** The Verge, Wired, TechCrunch, Ars Technica, MIT Tech Review, FTC News, etc.

---

## Known Limitations

1. Only RSS ingestion functional (Reddit/X/Discord are stubs)
2. BullMQ queue mode not complete (falls back to direct)
3. TF-IDF only (no embedding-based semantic clustering)
4. Single language support (English)
5. No real-time WebSocket updates
6. No admin UI for manual cluster management

---

## File Structure

```
ai-companions-watch/
├── app/api/           # Next.js API routes
├── lib/pipeline/      # Ingest, normalize, cluster, rank
├── lib/llm/           # LLM providers and prompts
├── lib/sources/       # RSS, Reddit, X, Discord connectors
├── prisma/            # Database schema
├── config/            # RSS feed configuration
├── scripts/           # Seed and worker scripts
└── docker-compose.yml # PostgreSQL + Redis
```

---

## Changelog

### January 8, 2026
- **E2E verification complete** with Supabase database
- **Stricter LLM prompt (v1.1)** - Filters out general AI news, only accepts AI companion-specific content
- **Confidence threshold (0.6)** - Rejects low-relevance articles automatically
- Discovered pg_trgm extension requirement for clustering
- Increased timeout to 120s for full pipeline completion

### January 7, 2026
- Build passes: TypeScript, tests (32/32), Next.js build
- Ready for E2E verification with live database
- All core pipeline components implemented
- Cursor pagination with stable ordering

---

## Deployment Checklist

- [x] E2E verification complete
- [ ] Environment variables configured in hosting platform
- [x] Database provisioned (Supabase)
- [ ] Enable pg_trgm extension: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
- [ ] Optional: Redis for queue mode
- [ ] Cron job configured for `/api/ingest`
- [ ] Monitoring/alerts set up
- [ ] Fix broken RSS feeds (The Verge AI, FTC News)
