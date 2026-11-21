import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Compass, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  ANIME_FORMATS,
  ANIME_GENRES,
  ANIME_SEASONS,
  ANIME_STATUSES,
  getCurrentAnimeSeason,
} from '../../config/constants.ts';
import type { AnimeSummary } from '../../types/anime.ts';
import { anilistService, type ExploreResponse } from '../../services/anilistService.ts';
import { useDebounce } from '../../hooks/useDebounce.ts';
import { usePlaybackCapabilities } from '../../hooks/usePlaybackCapabilities.ts';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.ts';
import { getPrimaryTitle } from '../../utils/slug.ts';
import { formatFormat, formatScore } from '../../utils/formatters.ts';
import { AnimeCard } from '../../components/anime/AnimeCard.tsx';
import { SafeImage } from '../../components/common/SafeImage.tsx';
import { CardGridSkeleton } from '../../components/common/Skeletons.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { DataStatusBanner } from '../../components/common/DataStatusBanner.tsx';

interface ExplorePageProps {
  mode?: 'explore' | 'seasonal' | 'movies' | 'popular' | 'genres';
}

const YEARS = Array.from({ length: 35 }, (_, i) => new Date().getFullYear() + 1 - i);

export function ExplorePage({ mode = 'explore' }: ExplorePageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentSeason = getCurrentAnimeSeason();
  const confirmedTracks = usePlaybackCapabilities();

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [searchFocused, setSearchFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<AnimeSummary[]>([]);

  const [genre, setGenre] = useState(searchParams.get('genre') || 'ALL');
  const [tag, setTag] = useState(searchParams.get('tag') || '');
  const [year, setYear] = useState(
    searchParams.get('year') || (mode === 'seasonal' ? String(currentSeason.year) : 'ALL')
  );
  const [season, setSeason] = useState(
    searchParams.get('season') || (mode === 'seasonal' ? currentSeason.season : 'ALL')
  );
  const [format, setFormat] = useState(
    searchParams.get('format') || (mode === 'movies' ? 'MOVIE' : 'ALL')
  );
  const [status, setStatus] = useState(searchParams.get('status') || 'ALL');
  const [audioFilter, setAudioFilter] = useState<'ALL' | 'sub' | 'dub'>('ALL');
  const [sort, setSort] = useState(
    searchParams.get('sort') ||
      (mode === 'popular'
        ? 'POPULARITY_DESC'
        : mode === 'movies'
        ? 'START_DATE_DESC'
        : 'TRENDING_DESC')
  );
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [accumulatedMedia, setAccumulatedMedia] = useState<AnimeSummary[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

  const debouncedSearch = useDebounce(search, 300);
  const [data, setData] = useState<ExploreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageTitle =
    mode === 'seasonal'
      ? 'Seasonal Anime'
      : mode === 'movies'
      ? 'Anime Movies'
      : mode === 'popular'
      ? 'Popular Anime'
      : mode === 'genres'
      ? 'Browse by Genre'
      : 'Browse Anime Catalog';

  useDocumentMeta({
    title: pageTitle,
    description: `Browse and filter ${pageTitle.toLowerCase()} by genre, year, season, format, audio track, and ranking.`,
  });

  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    const urlGenre = searchParams.get('genre') || 'ALL';
    const urlTag = searchParams.get('tag') || '';
    const urlSort = searchParams.get('sort');
    const urlStatus = searchParams.get('status') || 'ALL';
    const urlYear = searchParams.get('year');
    const urlFormat = searchParams.get('format');
    const urlSeason = searchParams.get('season');
    const urlPage = Number(searchParams.get('page') || 1);

    if (mode === 'seasonal') {
      setYear(urlYear || String(currentSeason.year));
      setSeason(urlSeason || currentSeason.season);
      setFormat(urlFormat || 'ALL');
      setGenre(urlGenre);
      setStatus(urlStatus);
      setSort(urlSort || 'POPULARITY_DESC');
    } else if (mode === 'movies') {
      setFormat('MOVIE');
      setSeason(urlSeason || 'ALL');
      setYear(urlYear || 'ALL');
      setGenre(urlGenre);
      setStatus(urlStatus);
      setSort(urlSort || 'START_DATE_DESC');
    } else if (mode === 'popular') {
      setFormat(urlFormat || 'ALL');
      setSeason(urlSeason || 'ALL');
      setYear(urlYear || 'ALL');
      setGenre(urlGenre);
      setStatus(urlStatus);
      setSort(urlSort || 'POPULARITY_DESC');
    } else {
      setGenre(urlGenre);
      setSort(urlSort || 'TRENDING_DESC');
      setStatus(urlStatus);
      setYear(urlYear || 'ALL');
      setSeason(urlSeason || 'ALL');
      setFormat(urlFormat || 'ALL');
    }
    setTag(urlTag);
    setSearch(urlSearch);
    setAccumulatedMedia([]);
    setPage(Number.isFinite(urlPage) && urlPage >= 1 ? Math.floor(urlPage) : 1);
  }, [mode, currentSeason.season, currentSeason.year, searchParams]);

  // Live search suggestions dropdown
  useEffect(() => {
    if (!debouncedSearch.trim()) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    anilistService
      .quickSearch(debouncedSearch, controller.signal)
      .then(setSuggestions)
      .catch(() => {});
    return () => controller.abort();
  }, [debouncedSearch]);

  useEffect(() => {
    const controller = new AbortController();
    if (page > 1 && loadingMore) {
      // Load More appends into accumulatedMedia cleanly
    } else {
      setLoading(true);
    }
    setError(null);

    anilistService
      .explore(
        {
          search: debouncedSearch || undefined,
          genre: genre !== 'ALL' ? genre : undefined,
          tag: tag.trim() || undefined,
          year: year !== 'ALL' ? Number(year) : undefined,
          season: season !== 'ALL' ? season : undefined,
          format: format !== 'ALL' ? format : undefined,
          status: status !== 'ALL' ? status : undefined,
          sort,
          page,
          perPage: 24,
        },
        controller.signal
      )
      .then((res) => {
        if (controller.signal.aborted) return;
        setData(res);
        setAccumulatedMedia((prev) => {
          if (page === 1 || !loadingMore) {
            return res.media || [];
          }
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...(res.media || []).filter((m) => !seen.has(m.id))];
        });
      })
      .catch((err) => {
        if (!controller.signal.aborted && err?.name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Failed to load catalog.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      });

    return () => controller.abort();
  }, [debouncedSearch, genre, tag, year, season, format, status, sort, page, retryNonce]);

  const visibleMedia = useMemo(() => {
    const sourceList = accumulatedMedia.length > 0 ? accumulatedMedia : data?.media || [];
    if (sourceList.length === 0) return [];
    if (audioFilter === 'ALL') return sourceList;
    // Only released titles where the active playback registry confirms the requested track
    if (!confirmedTracks.includes(audioFilter)) return [];
    return sourceList.filter((item) => item.status !== 'NOT_YET_RELEASED');
  }, [accumulatedMedia, data?.media, audioFilter, confirmedTracks]);

  const resetFilters = () => {
    setSearch('');
    setGenre('ALL');
    setTag('');
    setYear(mode === 'seasonal' ? String(currentSeason.year) : 'ALL');
    setSeason(mode === 'seasonal' ? currentSeason.season : 'ALL');
    setFormat(mode === 'movies' ? 'MOVIE' : 'ALL');
    setStatus('ALL');
    setAudioFilter('ALL');
    setSort(
      mode === 'popular'
        ? 'POPULARITY_DESC'
        : mode === 'movies'
        ? 'START_DATE_DESC'
        : 'TRENDING_DESC'
    );
    setAccumulatedMedia([]);
    setPage(1);
    setSearchParams({});
  };

  return (
    <div className="space-y-6 animate-av-enter">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-[#F5F3FF]">
            {pageTitle}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-[#A5A1B5] mt-1">
            {mode === 'movies'
              ? 'Latest anime movies ordered chronologically from newest releases, with genre, year, and ranking filters.'
              : 'Live AniList catalog with multi-axis filtering, audio availability, and sorting.'}
          </p>
        </div>
        <button
          type="button"
          onClick={resetFilters}
          className="av-btn-press inline-flex items-center gap-1.5 self-start rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3.5 py-2 text-xs font-medium text-zinc-700 dark:text-[#F5F3FF] hover:border-[#9B87FF] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
        >
          <X className="h-3.5 w-3.5" />
          Reset Filters
        </button>
      </div>

      <DataStatusBanner meta={data?._meta} />

      {confirmedTracks.length === 0 && (
        <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
          No playback servers are currently enabled; SUB/DUB track availability filters activate once a verified provider is enabled in Admin Console.
        </p>
      )}

      {/* Quick Genre Grid (prominent on /genres and helpful everywhere) */}
      {mode === 'genres' && (
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#11111B] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-[#A5A1B5]">
              Select Genre
            </h2>
            {genre !== 'ALL' && (
              <span className="text-xs font-medium text-[#9B87FF]">Active: {genre}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setGenre('ALL');
                setPage(1);
              }}
              className={`av-btn-press rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                genre === 'ALL'
                  ? 'bg-[#7C5CFF] text-white'
                  : 'bg-zinc-100 dark:bg-[#171722] text-zinc-700 dark:text-[#A5A1B5] hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-[#20202D]'
              }`}
            >
              All Genres
            </button>
            {ANIME_GENRES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => {
                  setGenre(g);
                  setPage(1);
                }}
                className={`av-btn-press rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                  genre === g
                    ? 'bg-[#7C5CFF] text-white'
                    : 'bg-zinc-100 dark:bg-[#171722] text-zinc-700 dark:text-[#A5A1B5] hover:text-zinc-900 dark:hover:text-[#F5F3FF] hover:bg-zinc-200 dark:hover:bg-[#20202D]'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Multi-axis Filter Bar */}
      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
        {/* Live Search with Suggestions */}
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 dark:text-[#A5A1B5]" />
          <input
            type="search"
            value={search}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search anime title..."
            aria-label="Filter anime by title"
            className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] py-2 pl-9 pr-3 text-sm text-zinc-900 dark:text-[#F5F3FF] placeholder:text-zinc-400 dark:placeholder:text-[#A5A1B5] focus:border-[#9B87FF] focus:outline-none"
          />
          {searchFocused && search.trim() && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] shadow-2xl p-1.5 z-40">
              {suggestions.slice(0, 5).map((item) => {
                const t = getPrimaryTitle(item.title);
                return (
                  <Link
                    key={item.id}
                    to={`/anime/${item.slug}`}
                    onMouseDown={(e) => e.preventDefault()}
                    className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-[#20202D] transition-colors"
                  >
                    <SafeImage
                      src={item.coverImage?.medium || item.coverImage?.large}
                      alt={t}
                      className="h-10 w-7 rounded object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF] truncate">
                        {t}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5] tabular-nums">
                        {formatFormat(item.format)}
                        {item.seasonYear ? ` · ${item.seasonYear}` : ''}
                        {item.averageScore ? ` · ${formatScore(item.averageScore)}` : ''}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <select
          value={genre}
          onChange={(e) => {
            setGenre(e.target.value);
            setPage(1);
          }}
          aria-label="Genre"
          className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-sm text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
        >
          <option value="ALL">All Genres</option>
          {ANIME_GENRES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-2">
          <select
            value={season}
            onChange={(e) => {
              setSeason(e.target.value);
              setPage(1);
            }}
            aria-label="Season"
            className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-2.5 py-2 text-sm text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
          >
            <option value="ALL">Season</option>
            {ANIME_SEASONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setPage(1);
            }}
            aria-label="Year"
            className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-2.5 py-2 text-sm text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
          >
            <option value="ALL">Year</option>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select
            value={format}
            onChange={(e) => {
              setFormat(e.target.value);
              setPage(1);
            }}
            aria-label="Format"
            className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-2.5 py-2 text-sm text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
          >
            <option value="ALL">Format</option>
            {ANIME_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Airing Status"
            className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-2.5 py-2 text-sm text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
          >
            <option value="ALL">Status</option>
            {ANIME_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <select
          value={audioFilter}
          onChange={(e) => setAudioFilter(e.target.value as 'ALL' | 'sub' | 'dub')}
          aria-label="Audio track availability"
          className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-sm text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
        >
          <option value="ALL">All Audio (SUB/DUB)</option>
          <option value="sub" disabled={!confirmedTracks.includes('sub')}>
            SUB Available
          </option>
          <option value="dub" disabled={!confirmedTracks.includes('dub')}>
            DUB Available
          </option>
        </select>

        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-zinc-400 dark:text-[#A5A1B5] shrink-0 hidden sm:block" />
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            aria-label="Sort by"
            className="w-full rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#11111B] px-3 py-2 text-sm text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
          >
            <option value="TRENDING_DESC">Trending</option>
            <option value="POPULARITY_DESC">Popularity</option>
            <option value="SCORE_DESC">Highest Score</option>
            <option value="UPDATED_AT_DESC">Recently Updated</option>
            <option value="FAVOURITES_DESC">Most Favorited</option>
            <option value="START_DATE_DESC">Newest Releases</option>
          </select>
        </div>
      </div>

      {tag && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[#9B87FF]/30 bg-[#9B87FF]/10 px-3 py-2 text-xs text-[#7C5CFF] dark:text-[#9B87FF]">
          <span>
            Filtering by AniList tag: <strong className="font-semibold">{tag}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              setTag('');
              setPage(1);
              const next = new URLSearchParams(searchParams);
              next.delete('tag');
              setSearchParams(next);
            }}
            className="inline-flex items-center gap-1 font-medium hover:underline"
          >
            <X className="h-3.5 w-3.5" />
            Clear Tag
          </button>
        </div>
      )}

      {loading && <CardGridSkeleton count={24} />}

      {!loading && error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center space-y-3">
          <p className="text-sm text-rose-500">{error}</p>
          <button
            type="button"
            onClick={() => setRetryNonce((n) => n + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-semibold text-white transition-colors"
          >
            Retry Loading
          </button>
        </div>
      )}

      {!loading && !error && data && visibleMedia.length === 0 && (
        <EmptyState
          icon={Compass}
          title="No matching anime found"
          description="Try broadening your genre, year, status, or audio filter."
          actionLabel="Clear Filters"
          onAction={resetFilters}
        />
      )}

      {!loading && !error && data && visibleMedia.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5">
            {visibleMedia.map((anime) => (
              <AnimeCard key={anime.id} anime={anime} />
            ))}
          </div>

          {/* Pagination & Load More */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-zinc-200 dark:border-white/[0.08]">
            <p className="text-xs text-zinc-500 dark:text-[#A5A1B5] tabular-nums">
              Showing {visibleMedia.length} · Page {data.pageInfo.currentPage} of{' '}
              {data.pageInfo.lastPage} ({data.pageInfo.total} titles)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {data.pageInfo.hasNextPage && (
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => {
                    setLoadingMore(true);
                    setPage((p) => p + 1);
                  }}
                  className="av-btn-press inline-flex items-center gap-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
                >
                  {loadingMore ? 'Loading More...' : 'Load More'}
                </button>
              )}
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => {
                  setLoadingMore(false);
                  setPage((p) => Math.max(1, p - 1));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="av-btn-press inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-[#F5F3FF] hover:bg-zinc-100 dark:hover:bg-[#20202D] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                type="button"
                disabled={!data.pageInfo.hasNextPage}
                onClick={() => {
                  setLoadingMore(false);
                  setPage((p) => p + 1);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="av-btn-press inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/[0.08] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-[#F5F3FF] hover:bg-zinc-100 dark:hover:bg-[#20202D] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
