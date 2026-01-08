'use client';

import { useState } from 'react';

interface Signal {
  id: string;
  title: string | null;
  url: string;
  sourceName: string;
  sourceDomain: string;
  publishedAt: string | null;
  createdAt: string;
}

interface LinkListProps {
  signals: Signal[];
  maxVisible?: number;
}

export function LinkList({ signals, maxVisible = 4 }: LinkListProps) {
  const [expanded, setExpanded] = useState(false);

  if (signals.length === 0) {
    return null;
  }

  const visibleSignals = expanded ? signals : signals.slice(0, maxVisible);
  const hiddenCount = signals.length - maxVisible;

  return (
    <div className="tm-more">
      <span className="tm-more-label">More: </span>
      {visibleSignals.map((signal, index) => (
        <span key={signal.id}>
          <a href={signal.url} target="_blank" rel="noopener noreferrer">
            {signal.sourceName}
          </a>
          {index < visibleSignals.length - 1 && (
            <span className="tm-more-sep">/</span>
          )}
        </span>
      ))}

      {hiddenCount > 0 && !expanded && (
        <>
          <span className="tm-more-sep">/</span>
          <button
            onClick={() => setExpanded(true)}
            className="tm-more a"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--link)',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            +{hiddenCount} more
          </button>
        </>
      )}

      {expanded && hiddenCount > 0 && (
        <>
          <span className="tm-more-sep">/</span>
          <button
            onClick={() => setExpanded(false)}
            className="tm-more a"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--link)',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            show less
          </button>
        </>
      )}
    </div>
  );
}
