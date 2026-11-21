import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Ban, Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { DiscoveredEpisode } from '../../types/anime.ts';

interface EpisodeSelectorProps {
  totalEpisodes: number;
  catalogEpisodes?: number | null;
  currentEpisode: number;
  discoveredEpisodes?: DiscoveredEpisode[];
  loading?: boolean;
  discoveryStatus?: 'complete' | 'partial' | 'unavailable';
  notice?: string | null;
  watchedEpisodes?: number[];
  isEstimatedCount?: boolean;
  onSelectEpisode: (ep: number) => void;
}

const CHUNK_SIZE = 100;

function isItemPlayable(item: DiscoveredEpisode, hasDiscoveryList: boolean): boolean {
  if (item.playable === false) return false;
  if (hasDiscoveryList && item.providers.length === 0) return false;
  return true;
}

export function EpisodeSelector({
  totalEpisodes,
  catalogEpisodes,
  currentEpisode,
  discoveredEpisodes,
  loading = false,
  discoveryStatus,
  notice,
  watchedEpisodes = [],
  isEstimatedCount = false,
  onSelectEpisode,
}: EpisodeSelectorProps) {
  const watchedSet = useMemo(() => new Set(watchedEpisodes), [watchedEpisodes]);
  const hasDiscoveryList = discoveredEpisodes !== undefined;

  const items: DiscoveredEpisode[] = useMemo(() => {
    if (discoveredEpisodes !== undefined) {
      return discoveredEpisodes;
    }
    if (loading || discoveryStatus === 'unavailable') return [];
    const count = Math.max(0, totalEpisodes);
    return Array.from({ length: count }, (_, i) => {
      const epNum = i + 1;
      return {
        episodeNumber: epNum,
        numberLabel: String(epNum),
        title: null,
        isSpecial: false,
        hasSub: true,
        hasDub: true,
        playable: true,
        providers: [],
        providerMappings: {},
      };
    });
  }, [discoveredEpisodes, loading, discoveryStatus, totalEpisodes]);

  const [chunkIndex, setChunkIndex] = useState(0);

  const currentIdx = useMemo(
    () => items.findIndex((item) => item.episodeNumber === currentEpisode),
    [items, currentEpisode]
  );

  useEffect(() => {
    if (currentIdx >= 0) {
      setChunkIndex(Math.floor(currentIdx / CHUNK_SIZE));
    } else {
      setChunkIndex(0);
    }
  }, [currentIdx, items.length]);

  const totalChunks = Math.max(1, Math.ceil(items.length / CHUNK_SIZE));
  const safeChunk = Math.min(chunkIndex, totalChunks - 1);
  const visibleItems =
    items.length > CHUNK_SIZE
      ? items.slice(safeChunk * CHUNK_SIZE, (safeChunk + 1) * CHUNK_SIZE)
      : items;

  const prevEpisodeItem = useMemo(() => {
    if (items.length === 0) return null;
    if (currentIdx >= 0) {
      for (let i = currentIdx - 1; i >= 0; i -= 1) {
        if (isItemPlayable(items[i], hasDiscoveryList)) return items[i];
      }
      return null;
    }
    for (let i = items.length - 1; i >= 0; i -= 1) {
      if (items[i].episodeNumber < currentEpisode && isItemPlayable(items[i], hasDiscoveryList)) {
        return items[i];
      }
    }
    return null;
  }, [items, currentIdx, currentEpisode, hasDiscoveryList]);

  const nextEpisodeItem = useMemo(() => {
    if (items.length === 0) return null;
    if (currentIdx >= 0) {
      for (let i = currentIdx + 1; i < items.length; i += 1) {
        if (isItemPlayable(items[i], hasDiscoveryList)) return items[i];
      }
      return null;
    }
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].episodeNumber > currentEpisode && isItemPlayable(items[i], hasDiscoveryList)) {
        return items[i];
      }
    }
    return null;
  }, [items, currentIdx, currentEpisode, hasDiscoveryList]);

  const playableCount = useMemo(
    () => items.filter((item) => isItemPlayable(item, hasDiscoveryList)).length,
    [items, hasDiscoveryList]
  );
  const unavailableCount = items.length - playableCount;

  const currentItem = currentIdx >= 0 ? items[currentIdx] : null;
  const displayCount = items.length;

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF]">
            {loading && displayCount === 0
              ? 'Discovering Available Episodes...'
              : isEstimatedCount && !discoveredEpisodes?.length
                ? `Known Aired Episodes (${displayCount})`
                : unavailableCount > 0
                  ? `Episodes (${playableCount} playable · ${unavailableCount} unavailable)`
                  : `Episodes (${displayCount})`}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-[#A5A1B5] tabular-nums">
            Selected: Episode {currentEpisode}
            {currentItem?.title ? ` · ${currentItem.title}` : ''}
            {currentItem && !isItemPlayable(currentItem, hasDiscoveryList)
              ? ' · Unavailable on active providers'
              : discoveryStatus === 'partial'
                ? ' · Partial provider results'
                : isEstimatedCount && !discoveredEpisodes?.length
                  ? ' · Total series count not yet confirmed'
                  : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!prevEpisodeItem}
            onClick={() => prevEpisodeItem && onSelectEpisode(prevEpisodeItem.episodeNumber)}
            className="av-btn-press inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-[#F5F3FF] hover:bg-zinc-100 dark:hover:bg-[#20202D] disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </button>
          <button
            type="button"
            disabled={!nextEpisodeItem}
            onClick={() => nextEpisodeItem && onSelectEpisode(nextEpisodeItem.episodeNumber)}
            className="av-btn-press inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-[#F5F3FF] hover:bg-zinc-100 dark:hover:bg-[#20202D] disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {items.length > CHUNK_SIZE && (
        <div className="flex flex-wrap items-center gap-1.5">
          {Array.from({ length: totalChunks }, (_, idx) => {
            const first = items[idx * CHUNK_SIZE]?.numberLabel;
            const last = items[Math.min((idx + 1) * CHUNK_SIZE - 1, items.length - 1)]?.numberLabel;
            const active = idx === safeChunk;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setChunkIndex(idx)}
                className={`av-btn-press rounded-md px-2.5 py-1 text-[11px] font-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                  active
                    ? 'bg-[#7C5CFF] text-white'
                    : 'bg-zinc-100 dark:bg-[#20202D] text-zinc-600 dark:text-[#A5A1B5] hover:bg-zinc-200 dark:hover:bg-[#2A2A3B]'
                }`}
              >
                {first}–{last}
              </button>
            );
          })}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-zinc-500 dark:text-[#A5A1B5]">
          <Loader2 className="h-4 w-4 animate-spin text-[#9B87FF]" />
          <span>Discovering available episodes across streaming providers...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 dark:border-white/[0.06] bg-zinc-50 dark:bg-[#11111B] p-4 text-center text-xs text-zinc-500 dark:text-[#A5A1B5]">
          No playable episodes were verified from active streaming providers yet.
          {catalogEpisodes
            ? ` AniList lists ${catalogEpisodes} episode${catalogEpisodes === 1 ? '' : 's'} in its catalog metadata.`
            : ''}
        </div>
      ) : (
        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2 max-h-64 overflow-y-auto pr-1">
          {visibleItems.map((item) => {
            const ep = item.episodeNumber;
            const playable = isItemPlayable(item, hasDiscoveryList);
            const isActive = ep === currentEpisode;
            const isWatched = watchedSet.has(ep);
            const displayLabel =
              item.isSpecial && Number.isInteger(ep) ? `SP ${item.numberLabel}` : item.numberLabel;

            return (
              <button
                key={`${item.numberLabel}-${ep}`}
                type="button"
                disabled={!playable}
                aria-label={
                  playable
                    ? `Episode ${item.numberLabel}${item.title ? `: ${item.title}` : ''}`
                    : `Episode ${item.numberLabel} — Unavailable on active providers`
                }
                title={
                  !playable
                    ? item.unavailableReason || `Episode ${item.numberLabel} is unavailable on current streaming providers`
                    : item.title || `Episode ${item.numberLabel}`
                }
                onClick={() => playable && onSelectEpisode(ep)}
                className={`av-btn-press relative flex items-center justify-center gap-1 rounded-lg py-2 px-1 text-xs font-mono font-medium tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#9B87FF] ${
                  !playable
                    ? isActive
                      ? 'border border-rose-500/40 bg-rose-500/10 text-rose-400 line-through cursor-not-allowed opacity-75'
                      : 'border border-zinc-200 dark:border-white/[0.05] bg-zinc-100/60 dark:bg-[#14141E] text-zinc-400 dark:text-[#A5A1B5]/45 line-through cursor-not-allowed'
                    : isActive
                      ? 'bg-[#7C5CFF] text-white shadow-sm shadow-[#7C5CFF]/30'
                      : isWatched
                        ? 'bg-[#9B87FF]/12 text-[#7C5CFF] dark:text-[#9B87FF] border border-[#9B87FF]/30 hover:bg-[#9B87FF]/20'
                        : 'bg-zinc-100 dark:bg-[#20202D] text-zinc-700 dark:text-[#F5F3FF]/85 hover:bg-zinc-200 dark:hover:bg-[#2A2A3B]'
                }`}
              >
                <span>{displayLabel}</span>
                {!playable ? (
                  <Ban className="h-3 w-3 shrink-0" aria-hidden="true" />
                ) : (
                  isWatched && !isActive && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

