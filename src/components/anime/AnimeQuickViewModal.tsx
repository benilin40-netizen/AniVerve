import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Heart,
  Play,
  Star,
  X,
} from 'lucide-react';
import { useQuickView } from '../../context/QuickViewContext.tsx';
import { useLibrary } from '../../context/LibraryContext.tsx';
import { anilistService } from '../../services/anilistService.ts';
import type { AnimeDetail } from '../../types/anime.ts';
import { getPrimaryTitle } from '../../utils/slug.ts';
import {
  formatDuration,
  formatFormat,
  formatMalScore,
  formatScore,
  formatStatus,
  stripHtml,
} from '../../utils/formatters.ts';
import { SafeImage } from '../common/SafeImage.tsx';

export function AnimeQuickViewModal() {
  const { quickViewAnime, closeQuickView } = useQuickView();
  const { getWatchlistEntry, upsertWatchlist, isFavorited, toggleFavorite } = useLibrary();

  const [detail, setDetail] = useState<AnimeDetail | null>(null);
  const [episodeCount, setEpisodeCount] = useState<number | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!quickViewAnime) {
      setDetail(null);
      setEpisodeCount(null);
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeQuickView();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    const controller = new AbortController();
    setLoadingDetail(true);
    Promise.all([
      anilistService.getDetails(quickViewAnime.id, controller.signal).catch(() => null),
      anilistService.getEpisodes(quickViewAnime.id, { signal: controller.signal }).catch(() => null),
    ])
      .then(([detRes, epRes]) => {
        if (detRes?.anime) {
          setDetail(detRes.anime);
        }
        if (epRes && typeof epRes.discoveredCount === 'number') {
          setEpisodeCount(epRes.discoveredCount);
        }
      })
      .finally(() => setLoadingDetail(false));

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      controller.abort();
    };
  }, [quickViewAnime, closeQuickView]);

  if (!quickViewAnime) return null;

  const anime = detail || quickViewAnime;
  const title = getPrimaryTitle(anime.title);
  const synopsis = stripHtml(anime.description).replace(/\s+/g, ' ').trim();
  const inWatchlist = getWatchlistEntry(anime.id);
  const favorited = isFavorited(anime.id);
  const hasRelease = anime.status !== 'NOT_YET_RELEASED';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Quick view for ${title}`}
      className="av-backdrop-enter fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#09090F]/80 backdrop-blur-md"
      onClick={closeQuickView}
    >
      <div
        className="av-modal-enter relative w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-[#171722] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner Top */}
        <div className="relative h-36 sm:h-44 bg-[#11111B] overflow-hidden">
          {anime.bannerImage || anime.coverImage?.extraLarge ? (
            <SafeImage
              src={anime.bannerImage || anime.coverImage?.extraLarge}
              alt={title}
              className="h-full w-full object-cover opacity-55"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-[#171722] via-[#171722]/60 to-transparent" />
          <button
            type="button"
            onClick={closeQuickView}
            aria-label="Close quick view"
            className="av-btn-press absolute top-3 right-3 rounded-lg bg-[#09090F]/80 border border-white/10 p-2 text-[#F5F3FF] hover:border-[#9B87FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 sm:px-6 pb-6 -mt-16 relative z-10">
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-start">
            <div className="w-24 sm:w-28 aspect-[3/4] shrink-0 overflow-hidden rounded-xl border-2 border-white/15 bg-[#11111B] shadow-xl">
              <SafeImage
                src={anime.coverImage?.extraLarge || anime.coverImage?.large}
                alt={title}
                className="h-full w-full object-cover"
              />
            </div>

            <div className="flex-1 min-w-0 pt-2 sm:pt-8 space-y-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono text-zinc-500 dark:text-[#A5A1B5] tabular-nums">
                <span className="text-[#7C5CFF] dark:text-[#9B87FF] font-semibold">
                  {formatFormat(anime.format)}
                </span>
                <span aria-hidden="true">·</span>
                <span>{formatStatus(anime.status)}</span>
                {anime.seasonYear && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{anime.seasonYear}</span>
                  </>
                )}
                {anime.duration && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{formatDuration(anime.duration)}</span>
                  </>
                )}
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-[#F5F3FF] leading-tight">
                {title}
              </h2>

              {/* Scores & Genre Line (zero-pill inline typography) */}
              <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
                {typeof anime.averageScore === 'number' && (
                  <span className="inline-flex items-center gap-1 font-mono font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                    <Star className="h-3.5 w-3.5 text-[#9B87FF] fill-current" />
                    AniList {formatScore(anime.averageScore)}
                  </span>
                )}
                {typeof anime.malScore === 'number' && (
                  <span className="font-mono font-semibold text-emerald-500">
                    MAL {formatMalScore(anime.malScore)}
                  </span>
                )}
                <span className="text-zinc-500 dark:text-[#A5A1B5]">
                  {loadingDetail
                    ? 'Checking episodes...'
                    : episodeCount !== null
                      ? `${episodeCount} playable eps verified`
                      : anime.episodes
                        ? `${anime.episodes} catalog eps`
                        : 'Episodes TBD'}
                </span>
              </div>
            </div>
          </div>

          {anime.genres && anime.genres.length > 0 && (
            <p className="mt-4 text-xs text-[#7C5CFF] dark:text-[#9B87FF] font-medium">
              {anime.genres.slice(0, 5).join(' · ')}
            </p>
          )}

          <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-zinc-600 dark:text-[#A5A1B5] line-clamp-4">
            {synopsis || 'No synopsis available for this title yet.'}
          </p>

          <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {hasRelease && (
                <Link
                  to={`/watch/${anime.slug}/1`}
                  onClick={closeQuickView}
                  className="av-btn-press inline-flex items-center gap-2 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Watch Now
                </Link>
              )}

              <Link
                to={`/anime/${anime.slug}`}
                onClick={closeQuickView}
                className="av-btn-press inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] px-3.5 py-2 text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF] hover:border-[#9B87FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                Explore Anime
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  upsertWatchlist({
                    anilistId: anime.id,
                    animeTitle: title,
                    animeSlug: anime.slug,
                    coverImage: anime.coverImage?.large || anime.coverImage?.extraLarge,
                    totalEpisodes: anime.episodes,
                    status: inWatchlist ? inWatchlist.status : 'PLAN_TO_WATCH',
                  })
                }
                className={`av-btn-press inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                  inWatchlist
                    ? 'border-[#9B87FF]/40 bg-[#9B87FF]/15 text-[#7C5CFF] dark:text-[#9B87FF]'
                    : 'border-zinc-200 dark:border-white/[0.08] text-zinc-600 dark:text-[#A5A1B5] hover:border-[#9B87FF]'
                }`}
              >
                {inWatchlist ? <Check className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                {inWatchlist ? 'Saved' : 'Watchlist'}
              </button>

              <button
                type="button"
                onClick={() =>
                  toggleFavorite({
                    anilistId: anime.id,
                    animeTitle: title,
                    animeSlug: anime.slug,
                    coverImage: anime.coverImage?.large || anime.coverImage?.extraLarge,
                  })
                }
                aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
                className={`av-btn-press rounded-lg p-2 border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                  favorited
                    ? 'border-rose-500/40 bg-rose-500/15 text-rose-400'
                    : 'border-zinc-200 dark:border-white/[0.08] text-zinc-500 dark:text-[#A5A1B5] hover:text-rose-400'
                }`}
              >
                <Heart className={`h-4 w-4 ${favorited ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
