import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Dices, Eye, Loader2, Play, RefreshCw, SlidersHorizontal, Star, X } from 'lucide-react';
import type { AnimeSummary } from '../../types/anime.ts';
import { universeService } from '../../services/universeService.ts';
import { ANIME_GENRES } from '../../config/constants.ts';
import { getPrimaryTitle } from '../../utils/slug.ts';
import {
  formatFormat,
  formatMalScore,
  formatScore,
  formatStatus,
  stripHtml,
} from '../../utils/formatters.ts';
import { useQuickView } from '../../context/QuickViewContext.tsx';
import { SafeImage } from '../common/SafeImage.tsx';

export function SurpriseMeSection() {
  const { openQuickView } = useQuickView();
  const [excludedGenres, setExcludedGenres] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<AnimeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleExclude = (genre: string) => {
    setExcludedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const triggerSurprise = async () => {
    setModalOpen(true);
    setLoading(true);
    setError(null);
    try {
      const anime = await universeService.getSurpriseAnime(excludedGenres);
      setPicked(anime);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not pick a surprise anime.');
    } finally {
      setLoading(false);
    }
  };

  const title = picked ? getPrimaryTitle(picked.title) : '';
  const synopsis = picked ? stripHtml(picked.description).replace(/\s+/g, ' ').trim() : '';

  return (
    <section className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-5 sm:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="font-mono text-[11px] uppercase tracking-wider text-[#7C5CFF] dark:text-[#9B87FF]">
            Instant Discovery
          </p>
          <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-[#F5F3FF]">
            Surprise Me
          </h2>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-[#A5A1B5]">
            Can't decide what to watch next? Let AniVerve draw an eligible series or film from the live catalog.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3.5 py-2.5 text-xs font-medium text-zinc-700 dark:text-[#A5A1B5] hover:border-[#9B87FF] transition-colors"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-[#9B87FF]" />
            Exclude Genres{excludedGenres.length > 0 ? ` (${excludedGenres.length})` : ''}
          </button>

          <button
            type="button"
            onClick={triggerSurprise}
            className="av-btn-press inline-flex items-center gap-2 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-md shadow-[#7C5CFF]/25 transition-colors"
          >
            <Dices className="h-4 w-4" />
            Surprise Me
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-white/[0.08] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-600 dark:text-[#A5A1B5]">
              Select any genres to exclude from random draws:
            </span>
            {excludedGenres.length > 0 && (
              <button
                type="button"
                onClick={() => setExcludedGenres([])}
                className="text-xs text-[#9B87FF] hover:underline"
              >
                Reset
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ANIME_GENRES.map((genre) => {
              const active = excludedGenres.includes(genre);
              return (
                <button
                  key={genre}
                  type="button"
                  onClick={() => toggleExclude(genre)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'border-rose-500/50 bg-rose-500/15 text-rose-400'
                      : 'border-zinc-200 dark:border-white/[0.08] text-zinc-600 dark:text-[#A5A1B5] hover:border-[#9B87FF]'
                  }`}
                >
                  {active ? `− ${genre}` : genre}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Surprise Me Result"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#09090F]/80 p-4 backdrop-blur-md"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="relative w-full max-w-xl rounded-2xl border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-[#171722] p-6 shadow-2xl animate-av-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-white/[0.08]">
              <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#9B87FF]">
                <Dices className="h-4 w-4" />
                Surprise Draw
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-[#20202D]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3 text-xs text-[#A5A1B5]">
                <Loader2 className="h-8 w-8 animate-spin text-[#9B87FF]" />
                <span>Scanning AniList catalog for your match...</span>
              </div>
            ) : error ? (
              <div className="py-10 text-center space-y-3">
                <p className="text-sm text-rose-400">{error}</p>
                <button
                  type="button"
                  onClick={triggerSurprise}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#7C5CFF] px-4 py-2 text-xs font-semibold text-white"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Try Again
                </button>
              </div>
            ) : picked ? (
              <div className="mt-5 space-y-5">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="w-32 aspect-[3/4] shrink-0 mx-auto sm:mx-0 overflow-hidden rounded-xl border border-white/10 shadow-lg">
                    <SafeImage
                      src={picked.coverImage?.extraLarge || picked.coverImage?.large}
                      alt={title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-[11px] font-mono text-[#A5A1B5] tabular-nums">
                      {formatFormat(picked.format)} · {formatStatus(picked.status)}
                      {picked.seasonYear ? ` · ${picked.seasonYear}` : ''}
                    </p>
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-[#F5F3FF] leading-tight">
                      {title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
                      {picked.averageScore && (
                        <span className="inline-flex items-center gap-1 text-[#9B87FF] font-semibold">
                          <Star className="h-3.5 w-3.5 fill-current" />
                          AniList {formatScore(picked.averageScore)}
                        </span>
                      )}
                      {typeof picked.malScore === 'number' && (
                        <span className="text-emerald-400 font-semibold">
                          MAL {formatMalScore(picked.malScore)}
                        </span>
                      )}
                    </div>
                    {picked.genres && picked.genres.length > 0 && (
                      <p className="text-xs text-[#9B87FF]">{picked.genres.slice(0, 4).join(' · ')}</p>
                    )}
                    <p className="text-xs leading-relaxed text-zinc-600 dark:text-[#A5A1B5] line-clamp-3">
                      {synopsis}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-4 border-t border-zinc-200 dark:border-white/[0.08]">
                  <div className="flex flex-wrap items-center gap-2">
                    {picked.status !== 'NOT_YET_RELEASED' && (
                      <Link
                        to={`/watch/${picked.slug}/1`}
                        onClick={() => setModalOpen(false)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-semibold text-white"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        Watch Now
                      </Link>
                    )}
                    <Link
                      to={`/anime/${picked.slug}`}
                      onClick={() => setModalOpen(false)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] px-3.5 py-2 text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF] hover:border-[#9B87FF]"
                    >
                      Explore Anime
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setModalOpen(false);
                        openQuickView(picked);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3 py-2 text-xs text-zinc-500 dark:text-[#A5A1B5] hover:text-[#F5F3FF]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Quick View
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={triggerSurprise}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#9B87FF]/40 bg-[#9B87FF]/10 px-3.5 py-2 text-xs font-semibold text-[#7C5CFF] dark:text-[#9B87FF] hover:bg-[#9B87FF]/20"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Try Again
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
