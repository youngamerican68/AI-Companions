-- CreateExtension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('MEDIA', 'PRODUCT', 'SOCIAL', 'REGULATORY');

-- CreateEnum
CREATE TYPE "IngestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('PRODUCT_UPDATE', 'MONETIZATION_CHANGE', 'SAFETY_YOUTH_RISK', 'NSFW_CONTENT_POLICY', 'CULTURAL_TREND', 'REGULATORY_LEGAL', 'BUSINESS_FUNDING');

-- CreateEnum
CREATE TYPE "ClusterStatus" AS ENUM ('ACTIVE', 'STALE');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "RawSignal" (
    "id" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "externalId" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawContentType" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "rawText" TEXT,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "RawSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "rawSignalId" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "title" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "language" TEXT DEFAULT 'en',
    "normalizedSummary" TEXT,
    "suggestedHeadline" TEXT,
    "categories" "Category"[],
    "entities" JSONB,
    "confidence" DOUBLE PRECISION,
    "llmProvider" TEXT,
    "llmModel" TEXT,
    "promptVersion" TEXT,
    "llmRawResponse" TEXT,
    "ingestStatus" "IngestStatus" NOT NULL DEFAULT 'PENDING',
    "ingestReason" TEXT,
    "normalizedAt" TIMESTAMP(3),
    "clusterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryCluster" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "contextSummary" TEXT NOT NULL,
    "searchText" TEXT NOT NULL,
    "categories" "Category"[],
    "importanceScore" INTEGER NOT NULL DEFAULT 0,
    "scoreBreakdown" JSONB,
    "manualBoost" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSignalAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ClusterStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "StoryCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClusterPlatform" (
    "clusterId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,

    CONSTRAINT "ClusterPlatform_pkey" PRIMARY KEY ("clusterId","platformId")
);

-- CreateTable
CREATE TABLE "SignalPlatform" (
    "signalId" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,

    CONSTRAINT "SignalPlatform_pkey" PRIMARY KEY ("signalId","platformId")
);

-- CreateTable
CREATE TABLE "Platform" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "websiteUrl" TEXT,
    "policyNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Platform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceCredibility" (
    "id" TEXT NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,

    CONSTRAINT "SourceCredibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "signalsFetched" INTEGER NOT NULL DEFAULT 0,
    "signalsAccepted" INTEGER NOT NULL DEFAULT 0,
    "signalsRejected" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,

    CONSTRAINT "IngestRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RawSignal_contentHash_key" ON "RawSignal"("contentHash");

-- CreateIndex
CREATE INDEX "RawSignal_sourceDomain_idx" ON "RawSignal"("sourceDomain");

-- CreateIndex
CREATE INDEX "RawSignal_fetchedAt_idx" ON "RawSignal"("fetchedAt");

-- CreateIndex
CREATE INDEX "RawSignal_contentHash_idx" ON "RawSignal"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "Signal_rawSignalId_key" ON "Signal"("rawSignalId");

-- CreateIndex
CREATE INDEX "Signal_publishedAt_idx" ON "Signal"("publishedAt");

-- CreateIndex
CREATE INDEX "Signal_clusterId_idx" ON "Signal"("clusterId");

-- CreateIndex
CREATE INDEX "Signal_ingestStatus_idx" ON "Signal"("ingestStatus");

-- CreateIndex
CREATE INDEX "Signal_createdAt_idx" ON "Signal"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoryCluster_fingerprint_key" ON "StoryCluster"("fingerprint");

-- CreateIndex
CREATE INDEX "StoryCluster_importanceScore_lastSignalAt_id_idx" ON "StoryCluster"("importanceScore" DESC, "lastSignalAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "StoryCluster_status_idx" ON "StoryCluster"("status");

-- CreateIndex
CREATE INDEX "StoryCluster_status_lastSignalAt_idx" ON "StoryCluster"("status", "lastSignalAt");

-- CreateIndex
CREATE INDEX "StoryCluster_fingerprint_idx" ON "StoryCluster"("fingerprint");

-- CreateIndex: GIN trigram index for pg_trgm similarity searches
CREATE INDEX "StoryCluster_searchText_trgm_idx" ON "StoryCluster" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ClusterPlatform_platformId_idx" ON "ClusterPlatform"("platformId");

-- CreateIndex
CREATE INDEX "SignalPlatform_platformId_idx" ON "SignalPlatform"("platformId");

-- CreateIndex
CREATE UNIQUE INDEX "Platform_slug_key" ON "Platform"("slug");

-- CreateIndex
CREATE INDEX "Platform_slug_idx" ON "Platform"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SourceCredibility_sourceDomain_key" ON "SourceCredibility"("sourceDomain");

-- CreateIndex
CREATE INDEX "SourceCredibility_sourceDomain_idx" ON "SourceCredibility"("sourceDomain");

-- CreateIndex
CREATE INDEX "IngestRun_startedAt_idx" ON "IngestRun"("startedAt");

-- CreateIndex
CREATE INDEX "IngestRun_status_idx" ON "IngestRun"("status");

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_rawSignalId_fkey" FOREIGN KEY ("rawSignalId") REFERENCES "RawSignal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "StoryCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterPlatform" ADD CONSTRAINT "ClusterPlatform_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "StoryCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterPlatform" ADD CONSTRAINT "ClusterPlatform_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalPlatform" ADD CONSTRAINT "SignalPlatform_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalPlatform" ADD CONSTRAINT "SignalPlatform_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE CASCADE ON UPDATE CASCADE;
