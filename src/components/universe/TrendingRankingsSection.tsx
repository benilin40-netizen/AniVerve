import React from 'react';
import { Link } from 'react-router-dom';
import { Eye, Flame, Play, Star } from 'lucide-react';
import type { AnimeSummary } from '../../types/anime.ts';
import { getPrimaryTitle } from '../../utils/slug.ts';
import { formatFormat, formatMalScore, formatScore, formatStatus } from '../../utils/formatters.ts';
import { useQuickView } from '../../context/QuickViewContext.tsx';
import { SafeImage } from '../common/SafeImage.tsx';

interface TrendingRankingsSectionProps {
  items: AnimeSummary[];
}

export function TrendingRankingsSection({ items }: TrendingRankingsSectionProps) {
  const { openQuickView } = useQuickView();
  const topTen = items.slice(0, 10);
  if (topTen.length === 0) return null;

  return (
    <section aria-labelledby="trending-rank-heading" className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[#7C5CFF] dark:text-[#9B87FF]">
            <Flame className="h-3.5 w-3.5" />
            Live AniList Rankings
          </p>
          <h2
            id="trending-rank-heading"
            className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-[#F5F3FF]"
          >
            Trending Right Now
          </h2>
        </div>

        <Link
          to="/explore?sort=TRENDING_DESC"
          className="text-xs font-medium text-[#7C5CFF] dark:text-[#9B87FF] hover:underline"
        >
          Full Rankings
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {topTen.map((anime, index) => {
          const title = getPrimaryTitle(anime.title);
          const rank = index + 1;
          return (
            <div
              key={anime.id}
              className="group flex items-center gap-3.5 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-3 hover:border-[#9B87FF]/60 transition-colors"
            >
              <span
                className={`w-8 text-center font-mono text-lg font-bold tabular-nums shrink-0 ${
                  rank <= 3
                    ? 'text-[#7C5CFF] dark:text-[#9B87FF]'
                    : 'text-zinc-400 dark:text-[#A5A1B5]'
                }`}
              >
                #{rank}
              </span>

              <Link
                to={`/anime/${anime.slug}`}
                className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-[#11111B]"
              >
                <SafeImage
                  src={anime.coverImage?.medium || anime.coverImage?.large}
                  alt={title}
                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </Link>

              <div className="min-w-0 flex-1 space-y-1">
                <Link
                  to={`/anime/${anime.slug}`}
                  className="block text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF] truncate hover:text-[#9B87FF]"
                >
                  {title}
                </Link>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500 dark:text-[#A5A1B5] tabular-nums">
                  <span>{formatFormat(anime.format)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatStatus(anime.status)}</span>
                  {anime.averageScore && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 font-mono text-zinc-800 dark:text-[#F5F3FF]">
                        <Star className="h-3 w-3 text-[#9B87FF] fill-current" />
                        {formatScore(anime.averageScore)}
                      </span>
                    </>
                  )}
                  {typeof anime.malScore === 'number' && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-emerald-500">
                        MAL {formatMalScore(anime.malScore)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => openQuickView(anime)}
                  aria-label={`Quick view ${title}`}
                  className="rounded-lg border border-zinc-200 dark:border-white/[0.08] p-2 text-zinc-500 dark:text-[#A5A1B5] hover:text-[#9B87FF] hover:border-[#9B87FF] transition-colors"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                {anime.status !== 'NOT_YET_RELEASED' && (
                  <Link
                    to={`/watch/${anime.slug}/1`}
                    aria-label={`Watch ${title}`}
                    className="rounded-lg bg-[#7C5CFF]/15 hover:bg-[#7C5CFF] p-2 text-[#7C5CFF] dark:text-[#9B87FF] hover:text-white transition-colors"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
