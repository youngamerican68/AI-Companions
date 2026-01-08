'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

interface Platform {
  slug: string;
  name: string;
}

interface FiltersProps {
  platforms?: Platform[];
}

const TIME_WINDOWS: { value: string; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

export function Filters({ platforms = [] }: FiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentPlatform = searchParams.get('platform') || '';
  const currentWindow = searchParams.get('window') || '7d';

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }

      // Reset cursor when filters change
      params.delete('cursor');

      router.push(`/?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="tm-filters">
      {/* Time Window */}
      <div className="tm-filter-group">
        {TIME_WINDOWS.map((window) => (
          <button
            key={window.value}
            onClick={() => updateFilter('window', window.value)}
            className={`tm-filter-btn ${currentWindow === window.value ? 'active' : ''}`}
          >
            {window.label}
          </button>
        ))}
      </div>

      {/* Platform Filter */}
      {platforms.length > 0 && (
        <select
          value={currentPlatform}
          onChange={(e) => updateFilter('platform', e.target.value)}
          className="tm-filter-select"
          style={{ marginLeft: '8px' }}
        >
          <option value="">All Platforms</option>
          {platforms.map((platform) => (
            <option key={platform.slug} value={platform.slug}>
              {platform.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
