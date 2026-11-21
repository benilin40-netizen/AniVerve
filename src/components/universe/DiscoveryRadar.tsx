import React, { useEffect, useState } from 'react';
import { Compass, Loader2, Radar } from 'lucide-react';
import type { AnimeSummary } from '../../types/anime.ts';
import { anilistService } from '../../services/anilistService.ts';
import { ANIME_FORMATS, ANIME_GENRES, ANIME_SEASONS, ANIME_STATUSES } from '../../config/constants.ts';
import { AnimeCard } from '../anime/AnimeCard.tsx';

export function DiscoveryRadar() {
  const [genre, setGenre] = useState('ALL');
  const [season, setSeason] = useState('ALL');
  const [format, setFormat] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [year, setYear] = useState('');
  const [sort, setSort] = useState('TRENDING_DESC');

  const [results, setResults] = useState<AnimeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    anilistService
      .explore(
        {
          genre: genre !== 'ALL' ? genre : undefined,
          season: season !== 'ALL' ? season : undefined,
          format: format !== 'ALL' ? format : undefined,
          status: status !== 'ALL' ? status : undefined,
          year: year ? Number(year) : undefined,
          sort,
          perPage: 10,
          page: 1,
        },
        controller.signal
      )
      .then((res) => setResults(res.media || []))
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [genre, season, format, status, year, sort]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 16 }, (_, idx) => currentYear + 1 - idx);

  const resetRadar = () => {
    setGenre('ALL');
    setSeason('ALL');
    setFormat('ALL');
    setStatus('ALL');
    setYear('');
    setSort('TRENDING_DESC');
  };

  return (
    <section aria-labelledby="radar-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[#7C5CFF] dark:text-[#9B87FF]">
            <Radar className="h-3.5 w-3.5" />
            Multi-Axis Live Filter
          </p>
          <h2
            id="radar-heading"
            className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-[#F5F3FF]"
          >
            AniVerve Discovery Radar
          </h2>
        </div>

        <button
          type="button"
          onClick={resetRadar}
          className="text-xs font-medium text-[#7C5CFF] dark:text-[#9B87FF] hover:underline"
        >
          Reset Radar
        </button>
      </div>

      {/* Control Matrix */}
      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-4 space-y-4">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            type="button"
            onClick={() => setGenre('ALL')}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              genre === 'ALL'
                ? 'border-[#9B87FF] bg-[#7C5CFF] text-white'
                : 'border-zinc-200 dark:border-white/[0.08] text-zinc-600 dark:text-[#A5A1B5] hover:border-[#9B87FF]'
            }`}
          >
            All Genres
          </button>
          {ANIME_GENRES.slice(0, 12).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGenre(g)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                genre === g
                  ? 'border-[#9B87FF] bg-[#7C5CFF] text-white'
                  : 'border-zinc-200 dark:border-white/[0.08] text-zinc-600 dark:text-[#A5A1B5] hover:border-[#9B87FF]'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="space-y-1">
            <span className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
              Season
            </span>
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-xs text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
            >
              <option value="ALL">Any Season</option>
              {ANIME_SEASONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
              Format
            </span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-xs text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
            >
              <option value="ALL">All Formats</option>
              {ANIME_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
              Release Year
            </span>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-xs text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
            >
              <option value="">Any Year</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
              Signal Axis
            </span>
            <select
              value={status !== 'ALL' ? `STATUS:${status}` : sort}
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith('STATUS:')) {
                  setStatus(v.replace('STATUS:', ''));
                } else {
                  setStatus('ALL');
                  setSort(v);
                }
              }}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-xs text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
            >
              <option value="TRENDING_DESC">Trending Velocity</option>
              <option value="POPULARITY_DESC">Most Popular</option>
              <option value="SCORE_DESC">Highest Rated</option>
              <option value="FAVOURITES_DESC">Community Favorites</option>
              {ANIME_STATUSES.map((st) => (
                <option key={st.value} value={`STATUS:${st.value}`}>
                  Status: {st.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-xs text-[#A5A1B5] gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-[#9B87FF]" />
          <span>Calibrating radar results...</span>
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-8 text-center text-xs text-[#A5A1B5]">
          <Compass className="h-6 w-6 mx-auto mb-2 text-[#9B87FF]" />
          No anime matched this radar combination. Try broadening year or season.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {results.map((anime) => (
            <AnimeCard key={anime.id} anime={anime} />
          ))}
        </div>
      )}
    </section>
  );
}
