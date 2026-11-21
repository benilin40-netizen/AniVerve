import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Megaphone, Play, RefreshCw } from 'lucide-react';
import type {
  AiringScheduleItem,
  AnimeCharacterSpotlight,
  AnimeOfTheDayPayload,
  AnimeSummary,
  CuratedCollection,
  FaceOffMatchup,
  HomeDiscoveryCategory,
  HomepageSectionKey,
  HomepageUniverseConfig,
} from '../../types/anime.ts';
import { anilistService, type HomeCollectionsResponse } from '../../services/anilistService.ts';
import { airingScheduleService } from '../../services/airingScheduleService.ts';
import { universeService } from '../../services/universeService.ts';
import { useLibrary } from '../../context/LibraryContext.tsx';
import { useTheme } from '../../context/ThemeContext.tsx';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.ts';
import { useInView } from '../../hooks/useInView.ts';
import { formatSeason } from '../../utils/formatters_compat.ts';
import { HeroShowcase } from '../../components/anime/HeroShowcase.tsx';
import { DiscoverMotionGallery } from '../../components/anime/DiscoverMotionGallery.tsx';
import { InfiniteAnimeCarousel } from '../../components/anime/InfiniteAnimeCarousel.tsx';
import { HorizontalAnimeRow } from '../../components/anime/HorizontalAnimeRow.tsx';
import { AnimeCard } from '../../components/anime/AnimeCard.tsx';
import { CardGridSkeleton, HeroSkeleton } from '../../components/common/Skeletons.tsx';
import { SectionHeader } from '../../components/common/SectionHeader.tsx';
import { SafeImage } from '../../components/common/SafeImage.tsx';
import { DataStatusBanner } from '../../components/common/DataStatusBanner.tsx';
import { TodayAnimeSpotlight } from '../../components/universe/TodayAnimeSpotlight.tsx';
import { SurpriseMeSection } from '../../components/universe/SurpriseMeModal.tsx';
import { TrendingRankingsSection } from '../../components/universe/TrendingRankingsSection.tsx';
import { DiscoveryRadar } from '../../components/universe/DiscoveryRadar.tsx';
import { MoodDiscoverySection } from '../../components/universe/MoodDiscoverySection.tsx';
import { SeasonPremiereCountdown } from '../../components/universe/SeasonPremiereCountdown.tsx';
import { AnimeFaceOff } from '../../components/universe/AnimeFaceOff.tsx';
import { CharacterSpotlight } from '../../components/universe/CharacterSpotlight.tsx';
import { OfficialTrailerSpotlight } from '../../components/universe/OfficialTrailerSpotlight.tsx';
import { AnimeCollectionsSection } from '../../components/universe/AnimeCollectionsSection.tsx';

const DEFAULT_SECTION_ORDER: HomepageSectionKey[] = [
  'spotlight',
  'surpriseMe',
  'trendingRankings',
  'discoveryRadar',
  'moodDiscovery',
  'premiereCountdown',
  'collections',
  'seasonal',
  'airing',
  'popular',
  'recentlyUpdated',
  'faceOff',
  'characterSpotlight',
  'trailerSpotlight',
  'upcoming',
  'movies',
];

function uniqueAnimeList(lists: AnimeSummary[][], excludeIds = new Set<number>()): AnimeSummary[] {
  const seen = new Set<number>(excludeIds);
  const result: AnimeSummary[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
}

export function HomePage() {
  useDocumentMeta({
    title: 'AniVerve – Anime Discovery, Live Airing Schedule & Streaming',
    description:
      'Explore trending and seasonal anime, live airing countdowns, MyAnimeList rankings, and unified streaming on AniVerve.',
  });

  const { watchHistory } = useLibrary();
  const { preferences } = useTheme();
  const [data, setData] = useState<HomeCollectionsResponse | null>(null);
  const [scheduleItems, setScheduleItems] = useState<AiringScheduleItem[]>([]);
  const [universeConfig, setUniverseConfig] = useState<HomepageUniverseConfig | null>(null);
  const [spotlight, setSpotlight] = useState<AnimeOfTheDayPayload | null>(null);
  const [collections, setCollections] = useState<CuratedCollection[]>([]);
  const [characters, setCharacters] = useState<AnimeCharacterSpotlight[]>([]);
  const [faceOff, setFaceOff] = useState<FaceOffMatchup | null>(null);
  const [discoveryCategories, setDiscoveryCategories] = useState<HomeDiscoveryCategory[]>([]);

  const [loading, setLoading] = useState(true);
  const [universeLoading, setUniverseLoading] = useState(true);
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

  const loadDiscoveryCategories = (signal?: AbortSignal) => {
    setDiscoveryLoading(true);
    setDiscoveryError(null);
    anilistService
      .getDiscoveryCategories(signal)
      .then((res) => {
        if (!signal?.aborted) {
          setDiscoveryCategories(res.categories || []);
        }
      })
      .catch((err) => {
        if (!signal?.aborted && err?.name !== 'AbortError') {
          setDiscoveryError(
            err instanceof Error ? err.message : 'Unable to load discovery category shelves.'
          );
        }
      })
      .finally(() => {
        if (!signal?.aborted) {
          setDiscoveryLoading(false);
        }
      });
  };

  const loadHome = (signal?: AbortSignal) => {
    setLoading(true);
    setUniverseLoading(true);
    setError(null);

    anilistService
      .getHomeCollections(signal)
      .then((homeData) => {
        if (signal?.aborted) return;
        setData(homeData);
      })
      .catch((err) => {
        if (!signal?.aborted && err?.name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Failed to load anime catalog.');
        }
      })
      .finally(() => {
        if (!signal?.aborted) {
          setLoading(false);
        }
      });

    loadDiscoveryCategories(signal);

    Promise.allSettled([
      universeService.getHomepageConfig(signal),
      universeService.getAnimeOfTheDay(signal),
      universeService.getOfficialCollections(signal),
      universeService.getCharacterSpotlights(1, 8, signal),
      universeService.getActiveFaceOff(signal),
      airingScheduleService.getSchedule({}, signal),
    ])
      .then((results) => {
        if (signal?.aborted) return;
        if (results[0].status === 'fulfilled') setUniverseConfig(results[0].value);
        if (results[1].status === 'fulfilled') setSpotlight(results[1].value);
        if (results[2].status === 'fulfilled') setCollections(results[2].value);
        if (results[3].status === 'fulfilled') setCharacters(results[3].value);
        if (results[4].status === 'fulfilled') setFaceOff(results[4].value);
        if (results[5].status === 'fulfilled') setScheduleItems(results[5].value.schedules || []);
      })
      .finally(() => {
        if (!signal?.aborted) {
          setUniverseLoading(false);
        }
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    loadHome(controller.signal);
    return () => controller.abort();
  }, []);

  const continueWatching = useMemo(
    () =>
      watchHistory.filter(
        (entry, idx, arr) => arr.findIndex((x) => x.anilistId === entry.anilistId) === idx
      ),
    [watchHistory]
  );

  const { motionGalleryItems, carouselRowOne, carouselRowTwo, trailerPool } = useMemo(() => {
    if (!data) {
      return {
        motionGalleryItems: [],
        carouselRowOne: [],
        carouselRowTwo: [],
        trailerPool: [],
      };
    }

    const richPool = uniqueAnimeList([
      data.featured || [],
      data.popular || [],
      data.movies || [],
      data.topRated || [],
      data.recommended || [],
      data.trending || [],
      data.seasonal || [],
    ]);

    const bannerFirst = [
      ...richPool.filter((a) => Boolean(a.bannerImage)),
      ...richPool.filter((a) => !a.bannerImage),
    ];
    const gallery = bannerFirst.slice(0, 12);
    const galleryIds = new Set(gallery.map((a) => a.id));

    const carouselPool = uniqueAnimeList(
      [
        data.topRated || [],
        data.popular || [],
        data.seasonal || [],
        data.airing || [],
        data.recentlyUpdated || [],
        data.movies || [],
        data.trending || [],
      ],
      galleryIds
    );

    const effectivePool = carouselPool.length >= 16 ? carouselPool : richPool;
    const rowOne = effectivePool.slice(0, 10);
    const rowOneIds = new Set(rowOne.map((a) => a.id));
    const rowTwo = effectivePool.filter((a) => !rowOneIds.has(a.id)).slice(0, 10);

    return {
      motionGalleryItems: gallery,
      carouselRowOne: rowOne,
      carouselRowTwo: rowTwo.length >= 4 ? rowTwo : richPool.slice(0, 10).reverse(),
      trailerPool: richPool,
    };
  }, [data]);

  const isCompact = preferences.compactMode || universeConfig?.cardDensity === 'compact';
  const gridClass = isCompact
    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3.5'
    : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5';

  const sectionOrder = universeConfig?.sectionOrder?.length
    ? universeConfig.sectionOrder
    : DEFAULT_SECTION_ORDER;
  const hiddenSet = useMemo(
    () => new Set(universeConfig?.hiddenSections || []),
    [universeConfig]
  );

  const recentlyUpdatedList = data?.recentlyUpdated || [];
  const recommendedList = data?.recommended?.length
    ? data.recommended
    : data?.topRated || [];

  const renderSectionByKey = (key: HomepageSectionKey): React.ReactNode => {
    if (!data || hiddenSet.has(key)) return null;

    switch (key) {
      case 'spotlight':
        return (
          <RevealSection key={key} id="section-spotlight">
            <TodayAnimeSpotlight spotlight={spotlight} loading={universeLoading} />
          </RevealSection>
        );
      case 'surpriseMe':
        return (
          <RevealSection key={key}>
            <SurpriseMeSection />
          </RevealSection>
        );
      case 'trendingRankings':
        return (
          <RevealSection key={key} id="section-trending">
            <TrendingRankingsSection items={data.trending} />
          </RevealSection>
        );
      case 'discoveryRadar':
        return (
          <RevealSection key={key}>
            <DiscoveryRadar />
          </RevealSection>
        );
      case 'moodDiscovery':
        return (
          <RevealSection key={key}>
            <MoodDiscoverySection />
          </RevealSection>
        );
      case 'premiereCountdown':
        return (
          <RevealSection key={key}>
            <SeasonPremiereCountdown
              airingSchedule={scheduleItems}
              upcomingAnime={data.upcoming}
              featuredPremiereIds={universeConfig?.featuredPremiereIds}
            />
          </RevealSection>
        );
      case 'faceOff':
        return (
          <RevealSection key={key}>
            <AnimeFaceOff matchup={faceOff} onUpdated={setFaceOff} />
          </RevealSection>
        );
      case 'characterSpotlight':
        return (
          <RevealSection key={key}>
            <CharacterSpotlight characters={characters} />
          </RevealSection>
        );
      case 'trailerSpotlight':
        return (
          <RevealSection key={key}>
            <OfficialTrailerSpotlight
              items={trailerPool}
              featuredTrailerAnimeId={universeConfig?.featuredTrailerAnimeId}
            />
          </RevealSection>
        );
      case 'collections':
        return (
          <RevealSection key={key}>
            <AnimeCollectionsSection
              collections={collections}
              featuredCollectionIds={universeConfig?.featuredCollectionIds}
            />
          </RevealSection>
        );
      case 'seasonal':
        return (
          <RevealSection key={key} className="space-y-5">
            <SectionHeader
              title={`Popular This Season · ${formatSeason(data.season, data.seasonYear)}`}
              to="/seasonal"
              linkLabel="View All"
            />
            <div className={gridClass}>
              {data.seasonal.slice(0, 12).map((anime, idx) => (
                <div
                  key={anime.id}
                  style={{ '--av-idx': idx } as React.CSSProperties}
                  className="av-stagger-child"
                >
                  <AnimeCard anime={anime} />
                </div>
              ))}
            </div>
          </RevealSection>
        );
      case 'airing':
        if (data.airing.length === 0) return null;
        return (
          <RevealSection key={key} className="space-y-5">
            <SectionHeader
              title="Currently Airing"
              to="/explore?status=RELEASING"
              linkLabel="View All"
            />
            <div className={gridClass}>
              {data.airing.slice(0, 12).map((anime, idx) => (
                <div
                  key={anime.id}
                  style={{ '--av-idx': idx } as React.CSSProperties}
                  className="av-stagger-child"
                >
                  <AnimeCard anime={anime} />
                </div>
              ))}
            </div>
          </RevealSection>
        );
      case 'popular':
        return (
          <RevealSection key={key} className="space-y-5">
            <SectionHeader
              title="All-Time Popular"
              to="/explore?sort=POPULARITY_DESC"
              linkLabel="View All"
            />
            <div className={gridClass}>
              {(data.popular.length ? data.popular : data.topRated)
                .slice(0, 12)
                .map((anime, idx) => (
                  <div
                    key={anime.id}
                    style={{ '--av-idx': idx } as React.CSSProperties}
                    className="av-stagger-child"
                  >
                    <AnimeCard anime={anime} />
                  </div>
                ))}
            </div>
          </RevealSection>
        );
      case 'recentlyUpdated':
        return (
          <RevealSection key={key} className="space-y-5">
            <SectionHeader
              title="Recently Updated"
              to="/explore?sort=UPDATED_AT_DESC"
              linkLabel="View All"
            />
            {recentlyUpdatedList.length > 0 ? (
              <div className={gridClass}>
                {recentlyUpdatedList.slice(0, 12).map((anime, idx) => (
                  <div
                    key={anime.id}
                    style={{ '--av-idx': idx } as React.CSSProperties}
                    className="av-stagger-child"
                  >
                    <AnimeCard anime={anime} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-8 text-center space-y-3">
                <p className="text-sm font-medium text-zinc-600 dark:text-[#A5A1B5]">
                  Recently updated episode information is currently unavailable.
                </p>
                <button
                  type="button"
                  onClick={() => loadHome()}
                  className="av-btn-press inline-flex items-center gap-2 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-semibold text-white"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </button>
              </div>
            )}
          </RevealSection>
        );
      case 'upcoming':
        if (data.upcoming.length === 0) return null;
        return (
          <RevealSection key={key} className="space-y-5">
            <SectionHeader
              title="Upcoming Anime"
              to="/explore?status=NOT_YET_RELEASED"
              linkLabel="View All"
            />
            <div className={gridClass}>
              {data.upcoming.slice(0, 12).map((anime, idx) => (
                <div
                  key={anime.id}
                  style={{ '--av-idx': idx } as React.CSSProperties}
                  className="av-stagger-child"
                >
                  <AnimeCard anime={anime} />
                </div>
              ))}
            </div>
          </RevealSection>
        );
      case 'movies':
        if (!data.movies?.length) return null;
        return (
          <RevealSection key={key} className="space-y-5">
            <SectionHeader
              title="Latest Anime Movies"
              to="/movies"
              linkLabel="View All"
            />
            <div className={gridClass}>
              {data.movies.slice(0, 12).map((anime, idx) => (
                <div
                  key={anime.id}
                  style={{ '--av-idx': idx } as React.CSSProperties}
                  className="av-stagger-child"
                >
                  <AnimeCard anime={anime} />
                </div>
              ))}
            </div>
          </RevealSection>
        );
      default:
        return null;
    }
  };

  const heroMode = universeConfig?.heroMode || 'spotlight-slider';
  const showAnnouncement =
    universeConfig?.announcementBanner?.enabled || heroMode === 'announcement';

  return (
    <div className={`relative ${isCompact ? 'space-y-9 sm:space-y-10' : 'space-y-12 sm:space-y-14'}`}>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 h-[540px] w-[960px] rounded-full bg-[#7C5CFF]/[0.07] dark:bg-[#7C5CFF]/[0.09] blur-[160px] -z-10"
      />

      {loading && (
        <div className="space-y-10">
          <HeroSkeleton />
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
            <CardGridSkeleton count={12} />
          </div>
        </div>
      )}

      {!loading && (error || !data) && (
        <div className="max-w-xl mx-auto mt-28 px-4">
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8 text-center">
            <p className="text-sm font-medium text-rose-600 dark:text-rose-300 mb-4">
              {error || 'Unable to load anime catalog right now.'}
            </p>
            <button
              type="button"
              onClick={() => loadHome()}
              className="av-btn-press inline-flex items-center gap-2 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-5 py-2.5 text-xs font-semibold text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry Loading
            </button>
          </div>
        </div>
      )}

      {!loading && data && (
        <>
          {heroMode !== 'minimal' && <HeroShowcase items={data.featured} />}

          <div
            className={`max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 ${
              isCompact ? 'space-y-10' : 'space-y-14'
            } ${heroMode === 'minimal' ? 'pt-6' : ''}`}
          >
            {showAnnouncement && universeConfig?.announcementBanner?.message && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#9B87FF]/35 bg-[#7C5CFF]/10 px-5 py-3.5 text-xs">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <span className="h-8 w-8 rounded-lg bg-[#7C5CFF]/20 text-[#9B87FF] flex items-center justify-center shrink-0">
                    <Megaphone className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                      {universeConfig.announcementBanner.title}
                    </p>
                    <p className="text-zinc-600 dark:text-[#A5A1B5]">
                      {universeConfig.announcementBanner.message}
                    </p>
                  </div>
                </div>
                {universeConfig.announcementBanner.linkUrl && (
                  <Link
                    to={universeConfig.announcementBanner.linkUrl}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-3.5 py-2 font-semibold text-white shrink-0 transition-colors"
                  >
                    {universeConfig.announcementBanner.linkLabel || 'Explore'}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            )}

            <DataStatusBanner meta={data._meta} onRefresh={() => loadHome()} />

            {/* Compact Sticky Category Quick-Nav Bar */}
            <nav
              aria-label="Homepage categories"
              className="sticky top-[68px] z-20 -mx-1 px-1 py-2 bg-zinc-50/90 dark:bg-[#09090F]/85 backdrop-blur-md border-y border-zinc-200/70 dark:border-white/[0.06]"
            >
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                {!hiddenSet.has('spotlight') && (
                  <button
                    type="button"
                    onClick={() =>
                      document
                        .getElementById('section-spotlight')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                    className="av-btn-press rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-[#F5F3FF] hover:border-[#9B87FF]/60 hover:text-[#7C5CFF] dark:hover:text-[#9B87FF] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
                  >
                    Today&apos;s Spotlight
                  </button>
                )}
                {!hiddenSet.has('trendingRankings') && (
                  <button
                    type="button"
                    onClick={() =>
                      document
                        .getElementById('section-trending')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                    className="av-btn-press rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-[#F5F3FF] hover:border-[#9B87FF]/60 hover:text-[#7C5CFF] dark:hover:text-[#9B87FF] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
                  >
                    Trending Rankings
                  </button>
                )}
                {(discoveryCategories.length > 0
                  ? discoveryCategories
                  : [
                      { key: 'topRated', title: 'Top Rated' },
                      { key: 'mostWatched', title: 'Most Watched' },
                      { key: 'hiddenGems', title: 'Hidden Gems' },
                      { key: 'bestRomance', title: 'Best Romance' },
                      { key: 'bestAction', title: 'Best Action' },
                      { key: 'fantasyIsekai', title: 'Fantasy & Isekai' },
                      { key: 'mysteryThriller', title: 'Mystery & Thriller' },
                      { key: 'comedySliceOfLife', title: 'Comedy & Slice of Life' },
                      { key: 'sciFiSupernatural', title: 'Sci-Fi & Supernatural' },
                      { key: 'classicAnime', title: 'Classic Anime' },
                      { key: 'newReleases', title: 'New Releases' },
                    ]
                ).map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() =>
                      document
                        .getElementById(`cat-${cat.key}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                    className="av-btn-press rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-[#F5F3FF] hover:border-[#9B87FF]/60 hover:text-[#7C5CFF] dark:hover:text-[#9B87FF] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
                  >
                    {cat.title}
                  </button>
                ))}
              </div>
            </nav>

            {continueWatching.length > 0 && (
              <RevealSection className="space-y-4">
                <SectionHeader
                  title="Continue Watching"
                  to="/watchlist"
                  linkLabel="Full History"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {continueWatching.slice(0, 4).map((item) => (
                    <Link
                      key={item.id}
                      to={`/watch/${item.animeSlug}/${item.episodeNumber}`}
                      className="group flex items-center gap-3.5 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-3 hover:border-[#9B87FF]/65 hover:-translate-y-0.5 transition-all duration-200"
                    >
                      <SafeImage
                        src={item.coverImage}
                        alt={item.animeTitle}
                        loading="lazy"
                        className="h-16 w-12 rounded-lg object-cover shrink-0 bg-[#171722]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF] truncate group-hover:text-[#9B87FF] transition-colors">
                          {item.animeTitle}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-[#A5A1B5] tabular-nums mt-0.5">
                          Episode {item.episodeNumber} · {item.language.toUpperCase()}
                        </p>
                      </div>
                      <span className="h-8 w-8 rounded-lg bg-[#7C5CFF]/12 text-[#9B87FF] flex items-center justify-center shrink-0 group-hover:bg-[#7C5CFF] group-hover:text-white transition-colors">
                        <Play className="h-3.5 w-3.5 fill-current" />
                      </span>
                    </Link>
                  ))}
                </div>
              </RevealSection>
            )}

            <DiscoverMotionGallery items={motionGalleryItems} />

            {/* First half of configured homepage modules */}
            {sectionOrder.slice(0, 6).map((key) => renderSectionByKey(key))}
          </div>

          <InfiniteAnimeCarousel
            rowOneItems={carouselRowOne}
            rowTwoItems={carouselRowTwo}
          />

          <div
            className={`max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 ${
              isCompact ? 'space-y-10' : 'space-y-14'
            }`}
          >
            {sectionOrder.slice(6).map((key) => renderSectionByKey(key))}

            {/* 11 Real-Catalog Discovery Shelves */}
            {discoveryLoading && discoveryCategories.length === 0 ? (
              <div className="space-y-10">
                <HorizontalAnimeRow
                  id="cat-topRated"
                  title="Top Rated"
                  subtitle="Highest-scored anime across the catalog"
                  viewAllTo="/explore?sort=SCORE_DESC"
                  items={[]}
                  loading
                  compact={isCompact}
                />
                <HorizontalAnimeRow
                  id="cat-mostWatched"
                  title="Most Watched"
                  subtitle="All-time viewer favorites worldwide"
                  viewAllTo="/explore?sort=POPULARITY_DESC"
                  items={[]}
                  loading
                  compact={isCompact}
                />
                <HorizontalAnimeRow
                  id="cat-bestAction"
                  title="Best Action"
                  subtitle="High-stakes battles and kinetic animation"
                  viewAllTo="/explore?genre=Action&sort=SCORE_DESC"
                  items={[]}
                  loading
                  compact={isCompact}
                />
              </div>
            ) : discoveryError && discoveryCategories.length === 0 ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                    Discovery shelves temporarily unavailable
                  </h2>
                  <p className="text-xs text-rose-600 dark:text-rose-300 mt-0.5">
                    {discoveryError}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => loadDiscoveryCategories()}
                  className="av-btn-press inline-flex items-center gap-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry Shelves
                </button>
              </div>
            ) : (
              <div className={isCompact ? 'space-y-9' : 'space-y-12'}>
                {discoveryCategories.map((cat) => (
                  <HorizontalAnimeRow
                    key={cat.key}
                    id={`cat-${cat.key}`}
                    title={cat.title}
                    subtitle={cat.subtitle}
                    viewAllTo={cat.exploreQuery}
                    items={cat.items}
                    compact={isCompact}
                  />
                ))}
              </div>
            )}

            {recommendedList.length > 0 && (
              <RevealSection className="space-y-5">
                <SectionHeader
                  title="Recommended Anime"
                  to="/explore?sort=FAVOURITES_DESC"
                  linkLabel="View All"
                />
                <div className={gridClass}>
                  {recommendedList.slice(0, 12).map((anime, idx) => (
                    <div
                      key={anime.id}
                      style={{ '--av-idx': idx } as React.CSSProperties}
                      className="av-stagger-child"
                    >
                      <AnimeCard anime={anime} />
                    </div>
                  ))}
                </div>
              </RevealSection>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RevealSection({
  id,
  children,
  className = '',
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLElement>();
  return (
    <section
      id={id}
      ref={ref}
      className={`scroll-mt-24 av-reveal ${inView ? 'av-reveal-visible' : ''} ${className}`}
    >
      {children}
    </section>
  );
}
