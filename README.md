# AI Companions Watch

A Techmeme-style real-time intelligence stream for the AI companions ecosystem. Clusters multiple signals into event narratives and ranks them by importance.

## Overview

AI Companions Watch automatically ingests news and signals about AI companion platforms (Replika, Character.AI, Nomi, etc.), normalizes them using LLM processing, clusters related signals into stories, and ranks them for display.

**Value proposition**: In under 5 minutes, understand what is happening today in AI companions.

## Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│  Connectors │───▶│  Normalize   │───▶│   Cluster   │───▶│    Rank      │
│  (RSS/API)  │    │  (LLM+Zod)   │    │(pg_trgm+TF) │    │  (Score)     │
└─────────────┘    └──────────────┘    └─────────────┘    └──────────────┘
       │                  │                   │                  │
       ▼                  ▼                   ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL (Prisma + pg_trgm)                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Components

- **Connectors**: RSS (functional), Reddit/X/Discord (stubs)
- **Normalize**: LLM-assisted summarization and classification (OpenAI-compatible)
- **Cluster**: Two-phase clustering (pg_trgm → TF-IDF cosine similarity)
- **Rank**: Multi-factor importance scoring with caps

## Prerequisites

- Node.js 18+
- pnpm
- Docker and Docker Compose
- OpenAI API key (or compatible API)

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd ai-companions-watch
pnpm install
```

### 2. Start Database Services

```bash
docker compose up -d
```

This starts:
- PostgreSQL 16 with pg_trgm extension
- Redis (optional, for queue mode)

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Required
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_companions_watch
OPENAI_API_KEY=sk-...
INGEST_SECRET=your-secret-token-min-16-chars

# Optional
REDIS_URL=redis://localhost:6379  # Enables queue mode
```

### 4. Initialize Database

```bash
pnpm db:generate   # Generate Prisma client
pnpm db:push       # Push schema to database
pnpm seed          # Seed platforms and credibility weights
```

### 5. Run Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Trigger Ingestion

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Authorization: Bearer your-secret-token-min-16-chars"
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `OPENAI_API_KEY` | Yes | - | OpenAI API key |
| `INGEST_SECRET` | Yes | - | Secret token for ingestion trigger (min 16 chars) |
| `REDIS_URL` | No | - | Redis URL (enables queue mode) |
| `LLM_PROVIDER` | No | `openai` | LLM provider (`openai` or `anthropic`) |
| `OPENAI_BASE_URL` | No | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | Model to use |
| `CLUSTER_SIMILARITY_THRESHOLD` | No | `0.4` | TF-IDF cosine similarity threshold |
| `CLUSTER_TRGM_THRESHOLD` | No | `0.2` | pg_trgm similarity threshold |
| `CLUSTER_ACTIVE_DAYS` | No | `7` | Days before cluster becomes stale |
| `RANKING_MAX_DOMAINS` | No | `6` | Max unique domains for diversity score |
| `RANKING_RECENCY_DECAY_HOURS` | No | `24` | Hours for recency decay |

## API Endpoints

### GET /api/clusters

Fetch paginated, ranked clusters.

**Query Parameters:**
- `category` - Filter by category (e.g., `SAFETY_YOUTH_RISK`)
- `platform` - Filter by platform slug (e.g., `replika`)
- `window` - Time window: `24h`, `7d`, `30d` (default: `7d`)
- `cursor` - Pagination cursor
- `limit` - Results per page (1-50, default: 20)

**Response:**
```json
{
  "clusters": [...],
  "nextCursor": "base64-encoded-cursor",
  "hasMore": true
}
```

### GET /api/platforms

List all platforms with stats.

### POST /api/ingest

Trigger ingestion cycle. Requires `Authorization: Bearer <INGEST_SECRET>` header.

## How Ingestion Works

1. **Fetch**: RSS feeds are fetched in parallel with rate limiting
2. **Dedupe**: Content hash prevents duplicate signals
3. **Store**: Raw payload stored immutably in `RawSignal`
4. **Normalize**: LLM extracts summary, categories, entities
5. **Cluster**: Signal assigned to existing cluster or new one created
6. **Rank**: Cluster importance score updated

### Execution Modes

- **Direct Mode** (default): Runs synchronously, bounded to 55s (Vercel-compatible)
- **Queue Mode** (when `REDIS_URL` set): Jobs enqueued to BullMQ

## How Clustering Works

### Two-Phase Approach

1. **Phase 1: pg_trgm** - SQL-native trigram similarity finds top 10 candidates
2. **Phase 2: TF-IDF** - Cosine similarity on candidate set with platform overlap bonus

### Fingerprint Deduplication

Clusters have a unique fingerprint: `platforms|date-bucket|top-keywords`

This prevents duplicate clusters even under concurrent processing.

### Race Condition Prevention

- `pg_advisory_xact_lock` prevents concurrent cluster creation
- P2002 (unique constraint) fallback for edge cases

## How Ranking Works

```
importanceScore =
  sourceDiversity +   // min(unique_domains, 6) * 2.0
  velocity +          // log1p(signals_last_hour) * 3.0
  credibility +       // avg_source_weight * 1.5
  category +          // max_category_weight * 2.0
  recency +           // exp(-hours_old/24) * 1.0
  manual              // manual_boost * 5.0
```

**Caps:**
- Source diversity caps at 6 domains (diminishing returns)
- Velocity is log-scaled (prevents Reddit spam)
- Category uses max weight (not sum)

## Adding a New Source

### RSS Feed

Edit `config/feeds.ts`:

```typescript
export const RSS_FEEDS: FeedConfig[] = [
  // ... existing feeds
  {
    name: 'Your Source',
    url: 'https://example.com/feed.xml',
    type: 'MEDIA',
    enabled: true,
  },
];
```

### New Connector Type

1. Create connector in `lib/sources/`:

```typescript
// lib/sources/myconnector.ts
import type { SourceConnector, SourceConfig, FetchResult } from './types';

export const myConnector: SourceConnector = {
  name: 'my-connector',

  canHandle(config: SourceConfig): boolean {
    return config.type === 'MY_TYPE';
  },

  async fetch(config: SourceConfig): Promise<FetchResult> {
    // Implementation
  },
};
```

2. Register in `lib/pipeline/ingest.ts`

## Testing

```bash
pnpm test        # Run all tests
pnpm test:watch  # Watch mode
```

### Test Files

- `tests/rank.test.ts` - Ranking algorithm tests
- `tests/normalize.test.ts` - LLM parser tests

## Deployment

### Vercel

1. Connect repository to Vercel
2. Set environment variables
3. Deploy

Ingestion runs via Vercel Cron:

```json
// vercel.json
{
  "crons": [{
    "path": "/api/ingest",
    "schedule": "0 * * * *"
  }]
}
```

### Self-Hosted

With Redis for queue mode:

```bash
# Terminal 1: Next.js
pnpm start

# Terminal 2: Worker
pnpm worker
```

## Project Structure

```
├── app/
│   ├── api/            # API routes
│   ├── platform/       # Platform profile pages
│   ├── page.tsx        # Homepage
│   └── layout.tsx      # Root layout
├── components/         # React components
├── lib/
│   ├── llm/           # LLM provider abstraction
│   ├── pipeline/      # Ingestion pipeline
│   └── sources/       # Source connectors
├── prisma/            # Database schema
├── scripts/           # CLI scripts
├── tests/             # Test files
└── config/            # Configuration
```

## Categories

Signals are classified into:

- `PRODUCT_UPDATE` - New features, updates
- `MONETIZATION_CHANGE` - Pricing, subscriptions
- `SAFETY_YOUTH_RISK` - Safety concerns, youth protection
- `NSFW_CONTENT_POLICY` - Content policies, NSFW
- `CULTURAL_TREND` - Social trends, discourse
- `REGULATORY_LEGAL` - Laws, regulations, enforcement
- `BUSINESS_FUNDING` - Funding, acquisitions, business news

## Seeded Platforms

- Replika
- Character.AI
- Nomi
- Kindroid
- Paradot
- Chai
- Crushon.AI
- Janitor AI

## Known Limitations

1. Only RSS ingestion is fully functional
2. Reddit/X/Discord require API keys (stubs provided)
3. No admin UI for manual boost/merge
4. No embedding-based semantic clustering
5. Single-language support (English)
6. No real-time WebSocket updates

## License

MIT
