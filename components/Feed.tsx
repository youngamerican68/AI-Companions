'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { ClusterCard } from './ClusterCard';
import type { Category } from '@prisma/client';

interface Signal {
  id: string;
  title: string | null;
  url: string;
  sourceName: string;
  sourceDomain: string;
  publishedAt: string | null;
  createdAt: string;
}

interface Platform {
  slug: string;
  name: string;
}

interface Cluster {
  id: string;
  headline: string;
  contextSummary: string;
  categories: Category[];
  platforms: Platform[];
  importanceScore: number;
  signalCount: number;
  lastSignalAt: string;
  signals: Signal[];
}

interface FeedResponse {
  clusters: Cluster[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function Feed() {
  const searchParams = useSearchParams();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchClusters = useCallback(
    async (cursor?: string) => {
      try {
        const params = new URLSearchParams(searchParams.toString());
        if (cursor) {
          params.set('cursor', cursor);
        }

        const response = await fetch(`/api/clusters?${params.toString()}`);

        if (!response.ok) {
          throw new Error('Failed to fetch clusters');
        }

        const data: FeedResponse = await response.json();
        return data;
      } catch (err) {
        throw err;
      }
    },
    [searchParams]
  );

  // Initial load and filter changes
  useEffect(() => {
    setLoading(true);
    setError(null);

    fetchClusters()
      .then((data) => {
        setClusters(data.clusters);
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [fetchClusters]);

  // Load more
  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);

    try {
      const data = await fetchClusters(nextCursor);
      setClusters((prev) => [...prev, ...data.clusters]);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <div className="tm-empty">
        <div className="tm-empty-text">Loading stories...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tm-empty">
        <div className="tm-empty-title" style={{ color: '#c00' }}>
          Error
        </div>
        <div className="tm-empty-text">{error}</div>
      </div>
    );
  }

  if (clusters.length === 0) {
    return (
      <div className="tm-empty">
        <div className="tm-empty-title">No stories found</div>
        <div className="tm-empty-text">
          Try adjusting your filters or check back later for updates.
        </div>
      </div>
    );
  }

  return (
    <div>
      {clusters.map((cluster, index) => (
        <ClusterCard
          key={cluster.id}
          cluster={cluster}
          isTopStory={index === 0}
        />
      ))}

      {hasMore && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="tm-filter-btn"
            style={{ padding: '8px 24px' }}
          >
            {loadingMore ? 'Loading...' : 'Load more stories'}
          </button>
        </div>
      )}
    </div>
  );
}
