import React from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import type { DataProvenanceMeta } from '../../types/anime.ts';

interface DataStatusBannerProps {
  meta?: DataProvenanceMeta | null;
  onRefresh?: () => void;
  className?: string;
}

export function DataStatusBanner({ meta, onRefresh, className = '' }: DataStatusBannerProps) {
  if (!meta || !meta.isStale) return null;

  const updatedLabel = meta.fetchedAt
    ? new Date(meta.fetchedAt).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Unknown';

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300 ${className}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>
          {meta.notice || 'Showing cached catalog snapshot while live upstream sync recovers.'}
          <span className="ml-1.5 font-mono tabular-nums opacity-85">
            (Last updated: {updatedLabel})
          </span>
        </span>
      </div>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 px-2.5 py-1 text-[11px] font-medium hover:bg-amber-500/15 transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className="h-3 w-3" />
          Retry Live Sync
        </button>
      )}
    </div>
  );
}
