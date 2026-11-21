import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Ban,
  Bookmark,
  Check,
  ExternalLink,
  Heart,
  Play,
  Share2,
  Sparkles,
  Star,
} from 'lucide-react';
import type {
  AnimeDetail,
  DataProvenanceMeta,
  EpisodeDiscoveryResult,
  MalAnimeInfo,
  MalFetchMeta,
  WatchStatus,
} from '../../types/anime.ts';
import { FALLBACK_BANNER_IMAGE, WATCH_STATUS_LABELS } from '../../config/constants.ts';
import { apiFetch } from '../../services/apiClient.ts';
import { anilistService } from '../../services/anilistService.ts';
import { getPrimaryTitle, parseAnimeIdFromSlug } from '../../utils/slug.ts';
import {
  formatFormat,
  formatMalScore,
  formatScore,
  formatSeason,
  formatStatus,
  stripHtml,
} from '../../utils/formatters.ts';
import { useLibrary } from '../../context/LibraryContext.tsx';
import { useToast } from '../../context/ToastContext.tsx';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.ts';
import { SafeImage } from '../../components/common/SafeImage.tsx';
import { DetailSkeleton } from '../../components/common/Skeletons.tsx';
import { SectionHeader } from '../../components/common/SectionHeader.tsx';
import { DataStatusBanner } from '../../components/common/DataStatusBanner.tsx';
import { AnimeCard } from '../../components/anime/AnimeCard.tsx';
import { EpisodeSelector } from '../../components/player/EpisodeSelector.tsx';
import { CountdownBadge } from '../../components/schedule/CountdownBadge.tsx';

export function AnimeDetailsPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const anilistId = parseAnimeIdFromSlug(slug || '');

  const [anime, setAnime] = useState<AnimeDetail | null>(null);
  const [catalogMeta, setCatalogMeta] = useState<DataProvenanceMeta | null>(null);
  const [malInfo, setMalInfo] = useState<MalAnimeInfo | null>(null);
  const [malMeta, setMalMeta] = useState<MalFetchMeta | null>(null);
  const [episodeDiscovery, setEpisodeDiscovery] = useState<EpisodeDiscoveryResult | null>(null);
  const [loadingEpisodes, setLoadingEpisodes] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [aiBrief, setAiBrief] = useState<{
    summary: string;
    themes: string[];
    aiEnhanced: boolean;
  } | null>(null);
  const [loadingAiBrief, setLoadingAiBrief] = useState(false);

  const {
    getWatchlistEntry,
    upsertWatchlist,
    isFavorited,
    toggleFavorite,
    watchHistory,
    ratings,
    saveRating,
  } = useLibrary();
  const { showToast } = useToast();

  useEffect(() => {
    if (!anilistId) {
      setError('Invalid anime identifier.');
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setLoadingEpisodes(true);
    setError(null);

    anilistService
      .getDetails(anilistId, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setAnime(res.anime);
        setCatalogMeta(res._meta || null);
        setMalInfo(res.malInfo);
        setMalMeta(res.malMeta || null);
      })
      .catch((err) => {
        if (!controller.signal.aborted && err?.name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Unable to load anime details.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    anilistService
      .getEpisodes(anilistId, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) {
          setEpisodeDiscovery(res);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted && err?.name !== 'AbortError') {
          setEpisodeDiscovery({
            anilistId,
            malId: null,
            title: `Anime #${anilistId}`,
            catalogEpisodes: null,
            discoveredCount: 0,
            discoveryStatus: 'unavailable',
            partialResults: true,
            providers: [],
            episodes: [],
            cached: false,
            fetchedAt: new Date().toISOString(),
            notice: 'Unable to verify streaming episodes from providers right now.',
          });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingEpisodes(false);
      });

    return () => controller.abort();
  }, [anilistId, retryNonce]);

  const title = anime ? getPrimaryTitle(anime.title) : 'Anime Details';
  const cleanDesc = stripHtml(anime?.description);

  const jsonLd = useMemo(() => {
    if (!anime) return null;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return [
      {
        '@type': anime.format === 'MOVIE' ? 'Movie' : 'TVSeries',
        name: title,
        alternateName: anime.title.romaji,
        description: cleanDesc.slice(0, 300),
        image: anime.coverImage?.extraLarge || anime.coverImage?.large,
        genre: anime.genres,
        numberOfEpisodes: anime.episodes || undefined,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: 'Explore', item: `${origin}/explore` },
          { '@type': 'ListItem', position: 3, name: title, item: `${origin}/anime/${anime.slug}` },
        ],
      },
    ];
  }, [anime, title, cleanDesc]);

  useDocumentMeta({
    title,
    description: cleanDesc.slice(0, 155),
    image: anime?.bannerImage || anime?.coverImage?.extraLarge,
    type: 'video.tv_show',
    jsonLd,
  });

  if (loading) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-20">
        <DetailSkeleton />
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-28">
        <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-8 text-center">
          <h1 className="text-xl font-bold mb-2">Anime Not Found</h1>
          <p className="text-sm text-zinc-500 dark:text-[#A5A1B5] mb-6">
            {error || 'Unable to locate this anime.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {anilistId && (
              <button
                type="button"
                onClick={() => setRetryNonce((n) => n + 1)}
                className="inline-flex rounded-lg border border-zinc-200 dark:border-white/[0.1] px-4 py-2 text-sm font-medium text-zinc-800 dark:text-[#F5F3FF] hover:border-[#9B87FF] transition-colors"
              >
                Retry
              </button>
            )}
            <Link
              to="/explore"
              className="inline-flex rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              Back to Browse
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const watchlistEntry = getWatchlistEntry(anime.id);
  const favorited = isFavorited(anime.id);
  const userRating = ratings.find((r) => r.anilistId === anime.id);
  const watchedEpNumbers = watchHistory
    .filter((h) => h.anilistId === anime.id)
    .map((h) => h.episodeNumber);
  const resumeEp =
    watchHistory.find((h) => h.anilistId === anime.id)?.episodeNumber ||
    (watchlistEntry?.episodesWatched ? Math.max(1, watchlistEntry.episodesWatched) : 1);

  const playableEpisodes = (episodeDiscovery?.episodes || []).filter(
    (e) => e.playable !== false && e.providers.length > 0
  );
  const defaultWatchEp =
    playableEpisodes.length > 0
      ? playableEpisodes.some((e) => e.episodeNumber === resumeEp)
        ? resumeEp
        : playableEpisodes[0].episodeNumber
      : resumeEp;
  const streamsConfirmedUnavailable =
    anime.status === 'NOT_YET_RELEASED' ||
    (!loadingEpisodes &&
      episodeDiscovery?.discoveryStatus === 'unavailable' &&
      playableEpisodes.length === 0);

  const totalEps =
    anime.episodes ||
    (anime.nextAiringEpisode && anime.nextAiringEpisode.episode > 1
      ? Math.max(1, anime.nextAiringEpisode.episode - 1)
      : Math.max(1, resumeEp));

  const handleStatusChange = async (status: WatchStatus) => {
    await upsertWatchlist({
      anilistId: anime.id,
      animeTitle: title,
      animeSlug: anime.slug,
      coverImage: anime.coverImage?.large || anime.coverImage?.extraLarge,
      totalEpisodes: anime.episodes,
      status,
      episodesWatched:
        status === 'COMPLETED' && anime.episodes
          ? anime.episodes
          : watchlistEntry?.episodesWatched || 0,
    });
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast('Anime link copied to clipboard.', 'success');
      }
    } catch {
      await navigator.clipboard?.writeText(url).catch(() => {});
      showToast('Link copied.', 'success');
    }
  };

  const animationStudios =
    anime.studios?.nodes?.filter((s) => s.isAnimationStudio) || [];
  const displayStudios =
    animationStudios.length > 0 ? animationStudios : anime.studios?.nodes || [];
  const visibleTags = (anime.tags || [])
    .filter((t) => !t.isAdult && !t.isMediaSpoiler && !t.isGeneralSpoiler)
    .slice(0, 14);
  const trailerEmbed =
    anime.trailer?.id && anime.trailer.site?.toLowerCase() === 'youtube'
      ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(anime.trailer.id)}?rel=0`
      : anime.trailer?.id && anime.trailer.site?.toLowerCase() === 'dailymotion'
      ? `https://www.dailymotion.com/embed/video/${encodeURIComponent(anime.trailer.id)}`
      : null;

  return (
    <div className="space-y-12">
      {/* Full-bleed Backdrop */}
      <div className="relative h-64 sm:h-80 lg:h-[380px] w-full overflow-hidden bg-[#11111B]">
        <SafeImage
          src={anime.bannerImage || anime.coverImage?.extraLarge || FALLBACK_BANNER_IMAGE}
          fallbackSrc={FALLBACK_BANNER_IMAGE}
          alt={title}
          className="h-full w-full object-cover object-center opacity-75"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#09090F] via-[#09090F]/55 to-[#09090F]/65" />
      </div>

      {/* Main Details Container */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <DataStatusBanner meta={catalogMeta} />
        <div className="-mt-32 sm:-mt-40 relative z-10 grid grid-cols-1 md:grid-cols-[230px_1fr] gap-6 lg:gap-10">
          {/* Poster Column */}
          <div className="mx-auto md:mx-0 w-44 sm:w-52 md:w-full space-y-3">
            <div className="aspect-[3/4] overflow-hidden rounded-xl border border-white/[0.14] shadow-2xl bg-[#171722]">
              <SafeImage
                src={anime.coverImage?.extraLarge || anime.coverImage?.large}
                alt={title}
                className="h-full w-full object-cover"
              />
            </div>

            {streamsConfirmedUnavailable ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled
                  title={
                    episodeDiscovery?.notice ||
                    'No playable episodes are currently available on active streaming providers.'
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-100 dark:bg-[#171722] px-4 py-3 text-sm font-semibold text-zinc-500 dark:text-[#A5A1B5] cursor-not-allowed opacity-75"
                >
                  <Ban className="h-4 w-4 shrink-0" />
                  {anime.status === 'NOT_YET_RELEASED' ? 'Not Yet Aired' : 'Streams Unavailable'}
                </button>
                <p className="text-[11px] leading-snug text-center text-zinc-500 dark:text-[#A5A1B5]">
                  {anime.status === 'NOT_YET_RELEASED'
                    ? 'Awaiting broadcast premiere.'
                    : 'Not yet indexed on active providers.'}
                </p>
              </div>
            ) : (
              <Link
                to={`/watch/${anime.slug}/${defaultWatchEp}`}
                className="av-btn-press flex w-full items-center justify-center gap-2 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#7C5CFF]/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                <Play className="h-4 w-4 fill-current" />
                {defaultWatchEp > 1 ? `Watch Ep ${defaultWatchEp}` : 'Start Watching'}
              </Link>
            )}
          </div>

          {/* Info Column */}
          <div className="space-y-6 pt-2 md:pt-16">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-[#A5A1B5] mb-2 tabular-nums">
                <span className="text-[#9B87FF] font-semibold">{formatFormat(anime.format)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatStatus(anime.status)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatSeason(anime.season, anime.seasonYear)}</span>
                {displayStudios.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-zinc-800 dark:text-[#F5F3FF]">
                      {displayStudios.map((s) => s.name).join(', ')}
                    </span>
                  </>
                )}
                {anime.episodes && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{anime.episodes} Episodes</span>
                  </>
                )}
                {anime.duration && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{anime.duration} min</span>
                  </>
                )}
              </div>

              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-[#F5F3FF] text-balance leading-tight">
                {title}
              </h1>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-[#A5A1B5]">
                {anime.title.romaji && anime.title.romaji !== title && (
                  <span>Romaji: {anime.title.romaji}</span>
                )}
                {anime.title.native && <span>Native: {anime.title.native}</span>}
              </div>
            </div>

            {/* AniList & MyAnimeList Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-3.5">
                <p className="text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
                  MyAnimeList Score
                </p>
                {malInfo?.score != null ? (
                  <p className="mt-1 text-xl font-bold font-mono tabular-nums text-zinc-900 dark:text-[#F5F3FF]">
                    {formatMalScore(malInfo.score)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-[#A5A1B5]">
                    Information unavailable.
                  </p>
                )}
                <p className="mt-1 text-[10px] text-zinc-400 dark:text-[#A5A1B5]/80">
                  {malMeta?.status === 'cached_stale' && malMeta.fetchedAt
                    ? `Jikan cache (${new Date(malMeta.fetchedAt).toLocaleDateString()})`
                    : malMeta?.status === 'no_mal_id'
                      ? 'No MAL ID linked'
                      : malMeta?.status === 'unavailable'
                        ? 'Jikan API unreachable'
                        : 'Jikan API'}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-3.5">
                <p className="text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
                  MAL Rank / Popularity
                </p>
                {malInfo?.rank || malInfo?.popularity ? (
                  <p className="mt-1 text-base font-semibold font-mono tabular-nums text-zinc-900 dark:text-[#F5F3FF]">
                    {malInfo?.rank ? `#${malInfo.rank}` : 'Unranked'}{' '}
                    <span className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
                      {malInfo?.popularity ? `/ #${malInfo.popularity}` : ''}
                    </span>
                  </p>
                ) : (
                  <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-[#A5A1B5]">
                    Information unavailable.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-3.5">
                <p className="text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
                  AniList Score
                </p>
                {anime.averageScore != null ? (
                  <p className="mt-1 text-xl font-bold font-mono tabular-nums text-[#7C5CFF] dark:text-[#9B87FF]">
                    {formatScore(anime.averageScore)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-[#A5A1B5]">
                    Information unavailable.
                  </p>
                )}
                <p className="mt-1 text-[10px] text-zinc-400 dark:text-[#A5A1B5]/80">
                  {catalogMeta?.isStale ? 'AniList Cache' : 'AniList API'}
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-3.5">
                <p className="text-[11px] font-medium text-zinc-500 dark:text-[#A5A1B5]">
                  {anime.nextAiringEpisode
                    ? `Next Ep ${anime.nextAiringEpisode.episode}`
                    : malInfo?.members
                    ? 'MAL Members'
                    : 'AniList Popularity'}
                </p>
                <div className="mt-1">
                  {anime.nextAiringEpisode ? (
                    <CountdownBadge airingAt={anime.nextAiringEpisode.airingAt} />
                  ) : malInfo?.members || anime.popularity ? (
                    <span className="text-base font-semibold font-mono tabular-nums text-zinc-900 dark:text-[#F5F3FF]">
                      {(malInfo?.members || anime.popularity)?.toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-zinc-500 dark:text-[#A5A1B5]">
                      Information unavailable.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Library & Actions */}
            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={watchlistEntry?.status || ''}
                onChange={(e) => {
                  if (e.target.value) void handleStatusChange(e.target.value as WatchStatus);
                }}
                aria-label="Watchlist Status"
                className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-2 text-xs font-medium text-zinc-900 dark:text-[#F5F3FF] focus:border-[#9B87FF] focus:outline-none"
              >
                <option value="">+ Add to Watchlist</option>
                {Object.entries(WATCH_STATUS_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => handleStatusChange('WATCHING')}
                className={`av-btn-press inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                  watchlistEntry?.status === 'WATCHING'
                    ? 'border-[#9B87FF] bg-[#9B87FF]/15 text-[#7C5CFF] dark:text-[#9B87FF]'
                    : 'border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] text-zinc-700 dark:text-[#F5F3FF] hover:bg-zinc-100 dark:hover:bg-[#20202D]'
                }`}
              >
                <Bookmark className="h-3.5 w-3.5" />
                Watching
              </button>

              <button
                type="button"
                onClick={() => handleStatusChange('COMPLETED')}
                className={`av-btn-press inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                  watchlistEntry?.status === 'COMPLETED'
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] text-zinc-700 dark:text-[#F5F3FF] hover:bg-zinc-100 dark:hover:bg-[#20202D]'
                }`}
              >
                <Check className="h-3.5 w-3.5" />
                Completed
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
                className={`av-btn-press inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                  favorited
                    ? 'border-rose-500/50 bg-rose-500/15 text-rose-500'
                    : 'border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] text-zinc-700 dark:text-[#F5F3FF] hover:bg-zinc-100 dark:hover:bg-[#20202D]'
                }`}
              >
                <Heart className={`h-3.5 w-3.5 ${favorited ? 'fill-current' : ''}`} />
                {favorited ? 'Favorited' : 'Favorite'}
              </button>

              <button
                type="button"
                onClick={handleShare}
                className="av-btn-press inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-2 text-xs font-medium text-zinc-700 dark:text-[#F5F3FF] hover:bg-zinc-100 dark:hover:bg-[#20202D] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                <Share2 className="h-3.5 w-3.5" />
                Share
              </button>

              <div className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-2.5 py-1.5 text-xs">
                <Star className="h-3.5 w-3.5 text-amber-400" />
                <select
                  value={userRating?.score || ''}
                  onChange={(e) => {
                    if (e.target.value) void saveRating(anime.id, Number(e.target.value));
                  }}
                  aria-label="Personal rating"
                  className="bg-transparent text-zinc-800 dark:text-[#F5F3FF] focus:outline-none"
                >
                  <option value="">Rate (1-10)</option>
                  {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} / 10
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {anime.genres && anime.genres.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-[#A5A1B5]">
                <span>Genres:</span>
                {anime.genres.map((g, idx) => (
                  <React.Fragment key={g}>
                    {idx > 0 && <span aria-hidden="true">·</span>}
                    <Link
                      to={`/explore?genre=${encodeURIComponent(g)}`}
                      className="font-medium text-zinc-800 dark:text-[#F5F3FF] hover:text-[#9B87FF] transition-colors"
                    >
                      {g}
                    </Link>
                  </React.Fragment>
                ))}
              </div>
            )}

            {visibleTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 dark:text-[#A5A1B5]">
                <span>Tags:</span>
                {visibleTags.map((tag, idx) => (
                  <React.Fragment key={tag.id || tag.name}>
                    {idx > 0 && <span aria-hidden="true">·</span>}
                    <Link
                      to={`/explore?tag=${encodeURIComponent(tag.name)}`}
                      title={tag.description || tag.category || tag.name}
                      className="text-zinc-700 dark:text-[#F5F3FF]/80 hover:text-[#9B87FF] transition-colors"
                    >
                      {tag.name}
                    </Link>
                  </React.Fragment>
                ))}
              </div>
            )}

            {cleanDesc && (
              <p className="text-sm sm:text-[15px] leading-relaxed text-zinc-700 dark:text-[#F5F3FF]/85 whitespace-pre-line max-w-4xl">
                {cleanDesc}
              </p>
            )}

            <div className="pt-1">
              {aiBrief ? (
                <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-4 max-w-4xl space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#7C5CFF] dark:text-[#9B87FF]">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      Spoiler-Free Series Brief
                    </span>
                    {aiBrief.themes.length > 0 && (
                      <span className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">
                        {aiBrief.themes.slice(0, 4).join(' · ')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm leading-relaxed text-zinc-700 dark:text-[#F5F3FF]/85">
                    {aiBrief.summary}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={loadingAiBrief}
                  onClick={async () => {
                    setLoadingAiBrief(true);
                    try {
                      const data = await apiFetch<{
                        summary: string;
                        themes: string[];
                        aiEnhanced: boolean;
                      }>(`/api/ai/summary/${anime.id}`);
                      setAiBrief(data);
                    } catch {
                      showToast('Spoiler-free summary unavailable right now.', 'info');
                    } finally {
                      setLoadingAiBrief(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-[#F5F3FF] hover:border-[#9B87FF] transition-colors disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5 text-[#9B87FF]" aria-hidden="true" />
                  {loadingAiBrief ? 'Generating Brief...' : 'Generate Spoiler-Free Brief'}
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500 dark:text-[#A5A1B5] pt-1 tabular-nums">
              <span className="font-mono text-[11px] text-zinc-600 dark:text-[#A5A1B5]">
                AniList #{anime.id}
                {anime.idMal ? ` · MAL #${anime.idMal}` : ' · MAL Unlinked'}
              </span>
              <a
                href={`https://anilist.co/anime/${anime.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-[#9B87FF] transition-colors"
              >
                AniList Reference
                <ExternalLink className="h-3 w-3" />
              </a>
              {anime.idMal && (
                <a
                  href={malInfo?.url || `https://myanimelist.net/anime/${anime.idMal}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-[#9B87FF] transition-colors"
                >
                  MyAnimeList ({malInfo?.members?.toLocaleString() || `ID #${anime.idMal}`})
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Watch Episodes Section */}
        <section className="space-y-4">
          <SectionHeader title="Episodes" />
          <EpisodeSelector
            totalEpisodes={
              episodeDiscovery?.episodes !== undefined ? episodeDiscovery.episodes.length : totalEps
            }
            catalogEpisodes={anime.episodes}
            currentEpisode={defaultWatchEp}
            discoveredEpisodes={episodeDiscovery?.episodes}
            loading={loadingEpisodes}
            discoveryStatus={episodeDiscovery?.discoveryStatus}
            notice={episodeDiscovery?.notice}
            watchedEpisodes={watchedEpNumbers}
            isEstimatedCount={!anime.episodes}
            onSelectEpisode={(ep) => navigate(`/watch/${anime.slug}/${ep}`)}
          />
        </section>

        {/* Official Trailer */}
        {trailerEmbed && (
          <section className="space-y-4">
            <SectionHeader title="Official Trailer" />
            <div className="aspect-video w-full max-w-3xl overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-black">
              <iframe
                src={trailerEmbed}
                title={`${title} Trailer`}
                loading="lazy"
                sandbox="allow-scripts allow-same-origin allow-presentation"
                className="h-full w-full border-0"
                allow="encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          </section>
        )}

        {/* Characters */}
        {anime.characters?.edges && anime.characters.edges.length > 0 && (
          <section className="space-y-4">
            <SectionHeader title="Characters & Voice Cast" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {anime.characters.edges.slice(0, 12).map((edge, idx) => {
                const va = edge.voiceActors?.[0];
                return (
                  <div
                    key={`${edge.node.id}-${idx}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SafeImage
                        src={edge.node.image?.medium || edge.node.image?.large}
                        alt={edge.node.name.full}
                        className="h-12 w-10 rounded-lg object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF] truncate">
                          {edge.node.name.full}
                        </p>
                        <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5] capitalize">
                          {edge.role.toLowerCase()}
                        </p>
                      </div>
                    </div>
                    {va && (
                      <div className="flex items-center gap-2 text-right min-w-0">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-700 dark:text-[#F5F3FF]/85 truncate">
                            {va.name.full}
                          </p>
                          <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">Japanese</p>
                        </div>
                        <SafeImage
                          src={va.image?.medium}
                          alt={va.name.full}
                          className="h-12 w-10 rounded-lg object-cover shrink-0"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Staff */}
        {anime.staff?.edges && anime.staff.edges.length > 0 && (
          <section className="space-y-4">
            <SectionHeader title="Production Staff" />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {anime.staff.edges.slice(0, 10).map((edge, idx) => (
                <div
                  key={`${edge.node.id}-${idx}`}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-2.5"
                >
                  <SafeImage
                    src={edge.node.image?.medium}
                    alt={edge.node.name.full}
                    className="h-11 w-9 rounded-lg object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF] truncate">
                      {edge.node.name.full}
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5] truncate">
                      {edge.role}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Related Anime */}
        {anime.relations?.edges && anime.relations.edges.length > 0 && (
          <section className="space-y-4">
            <SectionHeader title="Related Anime" />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {anime.relations.edges.slice(0, 6).map((edge, idx) => (
                <div key={`${edge.node.id}-${idx}`} className="space-y-1.5">
                  <p className="text-[11px] font-medium text-[#7C5CFF] dark:text-[#9B87FF]">
                    {edge.relationType.replace(/_/g, ' ')}
                  </p>
                  <AnimeCard anime={edge.node} showQuickWatch={false} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recommendations */}
        {anime.recommendations?.nodes && anime.recommendations.nodes.length > 0 && (
          <section className="space-y-4">
            <SectionHeader title="Recommended Similar Anime" />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {anime.recommendations.nodes
                .filter((n) => n.mediaRecommendation)
                .slice(0, 6)
                .map((n) => (
                  <AnimeCard key={n.id} anime={n.mediaRecommendation!} />
                ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
