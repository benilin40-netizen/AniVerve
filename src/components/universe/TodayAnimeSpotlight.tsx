import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Calendar, Eye, Play, Sparkles, Star } from 'lucide-react';
import type { AnimeOfTheDayPayload } from '../../types/anime.ts';
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

interface TodayAnimeSpotlightProps {
  spotlight: AnimeOfTheDayPayload | null;
  loading?: boolean;
}

export function TodayAnimeSpotlight({ spotlight, loading }: TodayAnimeSpotlightProps) {
  const { openQuickView } = useQuickView();

  if (loading) {
    return (
      <section className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 animate-pulse">
        <div className="h-56 rounded-xl bg-zinc-200 dark:bg-[#20202D]" />
      </section>
    );
  }

  if (!spotlight?.anime) return null;

  const { anime, dateKey, reasons, isAdminOverride } = spotlight;
  const title = getPrimaryTitle(anime.title);
  const synopsis = stripHtml(anime.description).replace(/\s+/g, ' ').trim();
  const hasRelease = anime.status !== 'NOT_YET_RELEASED';

  return (
    <section aria-labelledby="spotlight-heading" className="relative">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[#7C5CFF] dark:text-[#9B87FF]">
            <Sparkles className="h-3.5 w-3.5" />
            Today's Anime Spotlight
            <span className="text-zinc-400 dark:text-[#A5A1B5]">· {dateKey}</span>
          </p>
          <h2
            id="spotlight-heading"
            className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-[#F5F3FF]"
          >
            Anime of the Day
          </h2>
        </div>

        <span className="font-mono text-[11px] text-zinc-500 dark:text-[#A5A1B5]">
          {isAdminOverride ? 'Curator Featured Pick' : 'Daily Deterministic Rotation'}
        </span>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] shadow-lg">
        {anime.bannerImage && (
          <div className="pointer-events-none absolute inset-0 opacity-20 dark:opacity-25">
            <SafeImage src={anime.bannerImage} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#171722] via-[#171722]/90 to-[#171722]/60" />
          </div>
        )}

        <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-6 p-5 sm:p-7 items-center">
          <div className="md:col-span-3 lg:col-span-3">
            <Link
              to={`/anime/${anime.slug}`}
              className="block aspect-[3/4] max-w-[220px] mx-auto overflow-hidden rounded-xl border border-white/10 shadow-xl"
            >
              <SafeImage
                src={anime.coverImage?.extraLarge || anime.coverImage?.large}
                alt={title}
                className="h-full w-full object-cover hover:scale-[1.03] transition-transform duration-300"
              />
            </Link>
          </div>

          <div className="md:col-span-9 lg:col-span-9 space-y-4 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono text-zinc-600 dark:text-[#A5A1B5] tabular-nums">
              <span className="text-[#7C5CFF] dark:text-[#9B87FF] font-semibold">
                {formatFormat(anime.format)}
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatStatus(anime.status)}</span>
              {anime.seasonYear && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {anime.seasonYear}
                  </span>
                </>
              )}
              {typeof anime.averageScore === 'number' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-zinc-900 dark:text-[#F5F3FF] font-semibold">
                    <Star className="h-3.5 w-3.5 text-[#9B87FF] fill-current" />
                    AniList {formatScore(anime.averageScore)}
                  </span>
                </>
              )}
              {typeof anime.malScore === 'number' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-500 font-semibold">
                    MAL {formatMalScore(anime.malScore)}
                  </span>
                </>
              )}
            </div>

            <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-[#F5F3FF] leading-tight">
              <Link to={`/anime/${anime.slug}`} className="hover:text-[#9B87FF] transition-colors">
                {title}
              </Link>
            </h3>

            {anime.genres && anime.genres.length > 0 && (
              <p className="text-xs font-medium text-[#7C5CFF] dark:text-[#9B87FF]">
                {anime.genres.join(' · ')}
              </p>
            )}

            <p className="text-sm leading-relaxed text-zinc-600 dark:text-[#A5A1B5] line-clamp-3 max-w-3xl">
              {synopsis}
            </p>

            {reasons.length > 0 && (
              <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50/80 dark:bg-[#11111B]/80 p-3.5 space-y-1.5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
                  Why Selected Today
                </p>
                <ul className="space-y-1 text-xs text-zinc-700 dark:text-[#F5F3FF]/90">
                  {reasons.map((r) => (
                    <li key={r} className="flex items-start gap-2">
                      <span className="text-[#9B87FF] mt-0.5">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {hasRelease && (
                <Link
                  to={`/watch/${anime.slug}/1`}
                  className="av-btn-press inline-flex items-center gap-2 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2.5 text-xs font-semibold text-white"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Watch Now
                </Link>
              )}
              <Link
                to={`/anime/${anime.slug}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] px-4 py-2.5 text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF] hover:border-[#9B87FF] transition-colors"
              >
                Explore Details
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={() => openQuickView(anime)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3.5 py-2.5 text-xs font-medium text-zinc-600 dark:text-[#A5A1B5] hover:text-[#F5F3FF] hover:border-[#9B87FF] transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
                Quick View
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
