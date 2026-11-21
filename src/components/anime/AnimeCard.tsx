import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Bookmark, Check, Eye, Play, Star } from 'lucide-react';
import type { AnimeSummary } from '../../types/anime.ts';
import { getPrimaryTitle } from '../../utils/slug.ts';
import {
  formatFormat,
  formatFuzzyDate,
  formatMalScore,
  formatScore,
  formatStatus,
  formatTimeAgo,
  stripHtml,
} from '../../utils/formatters.ts';
import { useLibrary } from '../../context/LibraryContext.tsx';
import { useQuickView } from '../../context/QuickViewContext.tsx';
import { usePlaybackCapabilities } from '../../hooks/usePlaybackCapabilities.ts';
import { SafeImage } from '../common/SafeImage.tsx';

interface AnimeCardProps {
  anime: AnimeSummary;
  showQuickWatch?: boolean;
}

export function AnimeCard({ anime, showQuickWatch = true }: AnimeCardProps) {
  const navigate = useNavigate();
  const { getWatchlistEntry, upsertWatchlist } = useLibrary();
  const { openQuickView } = useQuickView();
  const confirmedTracks = usePlaybackCapabilities();

  const title = getPrimaryTitle(anime.title);
  const inWatchlist = getWatchlistEntry(anime.id);

  const shortSynopsis = stripHtml(anime.description).replace(/\s+/g, ' ').trim();
  const genreLine = anime.genres?.slice(0, 2).join(' · ') || '';
  const hasRelease = anime.status !== 'NOT_YET_RELEASED';
  const confirmedAudioLabel =
    hasRelease && confirmedTracks.length > 0
      ? confirmedTracks.map((t) => t.toUpperCase()).join('/')
      : null;

  const handleBookmark = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await upsertWatchlist({
      anilistId: anime.id,
      animeTitle: title,
      animeSlug: anime.slug,
      coverImage: anime.coverImage?.large || anime.coverImage?.extraLarge,
      totalEpisodes: anime.episodes,
      status: inWatchlist ? inWatchlist.status : 'PLAN_TO_WATCH',
    });
  };

  const handleQuickWatch = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/watch/${anime.slug}/1`);
  };

  return (
    <article className="group flex flex-col">
      <div className="relative aspect-[3/4] w-full rounded-xl shadow-sm transition-[transform,box-shadow] duration-200 ease-out md:group-hover:-translate-y-1.5 group-hover:shadow-[0_16px_32px_-12px_rgba(124,92,255,0.34)]">
        <Link
          to={`/anime/${anime.slug}`}
          className="relative block h-full w-full overflow-hidden rounded-xl bg-zinc-200 dark:bg-[#171722] border border-zinc-200/80 dark:border-white/[0.08] group-hover:border-[#9B87FF]/70 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
        >
          <SafeImage
            src={anime.coverImage?.extraLarge || anime.coverImage?.large || anime.coverImage?.medium}
            alt={title}
            fallbackLabel={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.05]"
          />

          {/* Balanced resting scrim + deeper hover synopsis scrim */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#09090F]/90 via-[#09090F]/15 to-transparent opacity-75 group-hover:opacity-0 transition-opacity duration-200" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#09090F] via-[#09090F]/88 to-[#09090F]/35 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200" />

          {/* Quick View + Bookmark Actions (always reachable on touch screens via .av-touch-actions) */}
          <div className="av-touch-actions absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openQuickView(anime);
              }}
              aria-label={`Quick view ${title}`}
              title="Quick View"
              className="av-btn-press h-9 w-9 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center backdrop-blur-md bg-[#09090F]/75 text-[#F5F3FF] border border-white/15 hover:bg-[#7C5CFF] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#9B87FF]"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleBookmark}
              aria-label={inWatchlist ? `Saved ${title} in watchlist` : `Add ${title} to watchlist`}
              title={inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
              className={`av-btn-press h-9 w-9 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center backdrop-blur-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#9B87FF] ${
                inWatchlist
                  ? 'bg-[#7C5CFF] text-white'
                  : 'bg-[#09090F]/75 text-[#F5F3FF] border border-white/15 hover:bg-[#7C5CFF]'
              }`}
            >
              {inWatchlist ? <Check className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            </button>
          </div>

          {/* Resting Episode / Rating Info */}
          {showQuickWatch && (
            <div className="pointer-events-none absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 group-hover:opacity-0 transition-opacity duration-200">
              <span className="text-[11px] font-medium text-[#F5F3FF] tabular-nums drop-shadow">
                {anime.latestEpisode
                  ? `EP ${anime.latestEpisode}`
                  : anime.nextAiringEpisode
                  ? `Ep ${anime.nextAiringEpisode.episode} soon`
                  : anime.episodes
                  ? `${anime.episodes} eps`
                  : formatFormat(anime.format)}
              </span>
              {typeof anime.malScore === 'number' ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-[#9B87FF] tabular-nums">
                  <Star className="h-3 w-3 fill-current" />
                  {formatMalScore(anime.malScore)}
                </span>
              ) : anime.averageScore ? (
                <span className="text-[11px] font-mono font-semibold text-[#F5F3FF]/90 tabular-nums">
                  {formatScore(anime.averageScore)}
                </span>
              ) : null}
            </div>
          )}

          {/* Hover / Focus Synopsis, Genres & Watch Action */}
          <div className="absolute inset-x-3 bottom-3 z-10 flex flex-col justify-end gap-2 opacity-0 translate-y-1.5 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-200 ease-out">
            <div className="pointer-events-none space-y-1">
              <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-[#A5A1B5]">
                <span>{formatFormat(anime.format)}</span>
                {typeof anime.malScore === 'number' ? (
                  <span className="font-mono text-[#9B87FF]">MAL {formatMalScore(anime.malScore)}</span>
                ) : anime.averageScore ? (
                  <span className="font-mono text-[#F5F3FF]">{formatScore(anime.averageScore)}</span>
                ) : null}
              </div>
              {genreLine && (
                <p className="text-[10px] font-medium text-[#9B87FF] truncate">{genreLine}</p>
              )}
              {shortSynopsis && (
                <p className="text-[11px] leading-relaxed text-[#F5F3FF]/90 line-clamp-3">
                  {shortSynopsis}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
              {hasRelease && showQuickWatch ? (
                <button
                  type="button"
                  onClick={handleQuickWatch}
                  aria-label={`Watch ${title}`}
                  className="av-btn-press inline-flex items-center gap-1.5 rounded-md bg-[#7C5CFF] hover:bg-[#9B87FF] px-2.5 py-1 text-[11px] font-semibold text-white whitespace-nowrap shrink-0"
                >
                  <Play className="h-3 w-3 fill-current" />
                  Watch
                </button>
              ) : (
                <span className="text-[11px] font-medium text-[#A5A1B5]">
                  {anime.seasonYear || 'Upcoming'}
                </span>
              )}
              <span className="pointer-events-none inline-flex items-center gap-1 text-[11px] font-semibold text-[#9B87FF]">
                Details
                <ArrowUpRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </Link>
      </div>

      <div className="mt-2.5 flex flex-col gap-0.5 min-w-0">
        <Link
          to={`/anime/${anime.slug}`}
          className="text-sm font-semibold leading-snug text-zinc-900 dark:text-[#F5F3FF] line-clamp-2 hover:text-[#7C5CFF] dark:hover:text-[#9B87FF] transition-colors"
        >
          {title}
        </Link>

        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-[#A5A1B5] truncate tabular-nums">
          {anime.airingAt ? (
            <>
              <span className="text-[#7C5CFF] dark:text-[#9B87FF] font-medium">{formatTimeAgo(anime.airingAt)}</span>
              <span aria-hidden="true">·</span>
            </>
          ) : anime.format === 'MOVIE' && anime.startDate?.year ? (
            <>
              <span>{formatFuzzyDate(anime.startDate)}</span>
              <span aria-hidden="true">·</span>
            </>
          ) : anime.seasonYear || anime.startDate?.year ? (
            <>
              <span>{anime.seasonYear || anime.startDate?.year}</span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span>{formatFormat(anime.format)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatStatus(anime.status)}</span>
        </div>

        {(typeof anime.malScore === 'number' || anime.averageScore || confirmedAudioLabel) && (
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-[#A5A1B5] truncate tabular-nums">
            {typeof anime.malScore === 'number' ? (
              <span className="font-mono font-medium text-[#7C5CFF] dark:text-[#9B87FF]">
                MAL {formatMalScore(anime.malScore)}
              </span>
            ) : anime.averageScore ? (
              <span className="font-mono font-medium text-zinc-800 dark:text-[#F5F3FF]">
                {formatScore(anime.averageScore)}
              </span>
            ) : null}
            {(typeof anime.malScore === 'number' || anime.averageScore) && confirmedAudioLabel && (
              <span aria-hidden="true">·</span>
            )}
            {confirmedAudioLabel && <span>{confirmedAudioLabel}</span>}
          </div>
        )}
      </div>
    </article>
  );
}
