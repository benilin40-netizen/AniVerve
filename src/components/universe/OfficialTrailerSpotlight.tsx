import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Film, Play, VideoOff } from 'lucide-react';
import type { AnimeSummary } from '../../types/anime.ts';
import { getPrimaryTitle } from '../../utils/slug.ts';
import { formatFormat, formatScore } from '../../utils/formatters.ts';
import { SafeImage } from '../common/SafeImage.tsx';

interface OfficialTrailerSpotlightProps {
  items: AnimeSummary[];
  featuredTrailerAnimeId?: number | null;
}

function getEmbedUrl(trailer?: AnimeSummary['trailer']): string | null {
  if (!trailer?.id || !trailer?.site) return null;
  const site = trailer.site.toLowerCase();
  if (site === 'youtube') {
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.id)}?autoplay=1&rel=0`;
  }
  if (site === 'dailymotion') {
    return `https://www.dailymotion.com/embed/video/${encodeURIComponent(trailer.id)}?autoplay=1`;
  }
  return null;
}

export function OfficialTrailerSpotlight({
  items,
  featuredTrailerAnimeId,
}: OfficialTrailerSpotlightProps) {
  const candidates = useMemo(() => {
    const withTrailer = items.filter(
      (a, idx, arr) =>
        Boolean(a.trailer?.id && a.trailer?.site) &&
        ['youtube', 'dailymotion'].includes((a.trailer?.site || '').toLowerCase()) &&
        arr.findIndex((x) => x.id === a.id) === idx
    );
    if (featuredTrailerAnimeId) {
      withTrailer.sort((a, b) =>
        a.id === featuredTrailerAnimeId ? -1 : b.id === featuredTrailerAnimeId ? 1 : 0
      );
    }
    return withTrailer.slice(0, 6);
  }, [items, featuredTrailerAnimeId]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const selected = candidates[selectedIndex] || null;

  if (!selected) {
    return (
      <section className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-6 flex items-center gap-3 text-xs text-zinc-500 dark:text-[#A5A1B5]">
        <VideoOff className="h-5 w-5 text-[#9B87FF]" />
        <span>No official YouTube or Dailymotion trailers are available in the current feed.</span>
      </section>
    );
  }

  const title = getPrimaryTitle(selected.title);
  const embedUrl = getEmbedUrl(selected.trailer);
  const thumb =
    selected.trailer?.thumbnail || selected.bannerImage || selected.coverImage?.extraLarge;

  return (
    <section aria-labelledby="trailer-heading" className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[#7C5CFF] dark:text-[#9B87FF]">
            <Film className="h-3.5 w-3.5" />
            Click-to-Play Official Previews
          </p>
          <h2
            id="trailer-heading"
            className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-[#F5F3FF]"
          >
            Official Trailer Spotlight
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-4 sm:p-5">
        <div className="lg:col-span-8">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#09090F] border border-white/[0.08]">
            {playing && embedUrl ? (
              <iframe
                src={embedUrl}
                title={`${title} Official Trailer`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            ) : (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="group relative h-full w-full text-left"
              >
                <SafeImage
                  src={thumb}
                  alt={`${title} trailer thumbnail`}
                  className="h-full w-full object-cover opacity-75 group-hover:scale-[1.02] transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#09090F] via-[#09090F]/35 to-transparent" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#7C5CFF]/90 text-white shadow-2xl group-hover:bg-[#9B87FF] group-hover:scale-105 transition-all">
                    <Play className="h-7 w-7 fill-current ml-0.5" />
                  </span>
                </div>
                <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-wider text-[#9B87FF]">
                      {selected.trailer?.site} Official Trailer
                    </p>
                    <p className="text-lg font-bold text-[#F5F3FF]">{title}</p>
                  </div>
                  <span className="text-xs font-mono text-[#A5A1B5]">
                    {formatFormat(selected.format)} · {formatScore(selected.averageScore)}
                  </span>
                </div>
              </button>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col justify-between gap-3">
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {candidates.map((item, idx) => {
              const t = getPrimaryTitle(item.title);
              const active = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedIndex(idx);
                    setPlaying(false);
                  }}
                  className={`w-full flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                    active
                      ? 'border-[#9B87FF] bg-[#7C5CFF]/15'
                      : 'border-zinc-200 dark:border-white/[0.08] hover:border-[#9B87FF]/50'
                  }`}
                >
                  <SafeImage
                    src={item.coverImage?.medium || item.coverImage?.large}
                    alt={t}
                    className="h-14 w-10 rounded-md object-cover shrink-0 bg-[#11111B]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF] truncate">
                      {t}
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5] tabular-nums">
                      {formatFormat(item.format)}
                      {item.seasonYear ? ` · ${item.seasonYear}` : ''}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <Link
            to={`/anime/${selected.slug}`}
            className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] py-2 text-center text-xs font-semibold text-[#7C5CFF] dark:text-[#9B87FF] hover:border-[#9B87FF] transition-colors"
          >
            Open {title} Page
          </Link>
        </div>
      </div>
    </section>
  );
}
