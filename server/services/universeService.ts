import crypto from 'node:crypto';
import type {
  AdminNotificationItem,
  AnimeOfTheDayPayload,
  AnimeSummary,
  CuratedCollection,
  FaceOffMatchup,
  FavoriteItem,
  HomepageSectionKey,
  HomepageUniverseConfig,
  UniversalSearchResult,
  UserRatingItem,
  WatchHistoryItem,
  WatchlistItem,
} from '../../src/types/anime.ts';
import {
  exploreAnime,
  getAnimeDetails,
  getHomeCollections,
  universalSearchCatalog,
} from './anilistService.ts';
import { getCached, setCached } from './cacheService.ts';
import { dbGet, dbList, dbSet } from './db.ts';
import { getCachedMalScore, getMalAnimeInfoWithMeta } from './malService.ts';

const ALL_KNOWN_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
];

export const DEFAULT_SECTION_ORDER: HomepageSectionKey[] = [
  'spotlight',
  'surpriseMe',
  'trendingRankings',
  'discoveryRadar',
  'moodDiscovery',
  'premiereCountdown',
  'faceOff',
  'characterSpotlight',
  'trailerSpotlight',
  'collections',
  'seasonal',
  'airing',
  'popular',
  'recentlyUpdated',
  'upcoming',
  'movies',
];

export function getDefaultHomepageConfig(): HomepageUniverseConfig {
  const now = new Date().toISOString();
  return {
    id: 'homepage',
    heroMode: 'spotlight-slider',
    announcementBanner: {
      enabled: false,
      title: 'Welcome to AniVerve 2.0',
      message: 'Explore seasonal premieres, interactive discovery radar, and live anime schedules.',
      linkUrl: '/explore',
      linkLabel: 'Explore Catalog',
    },
    animeOfTheDayOverrideId: null,
    featuredCollectionIds: [],
    featuredPremiereIds: [],
    featuredTrailerAnimeId: null,
    faceOffOverrideIds: null,
    sectionOrder: [...DEFAULT_SECTION_ORDER],
    hiddenSections: [],
    particleDensity: 'balanced',
    cardDensity: 'comfortable',
    draft: null,
    publishedAt: now,
    updatedAt: now,
  };
}

export async function getHomepageUniverseConfig(): Promise<HomepageUniverseConfig> {
  const existing = await dbGet<HomepageUniverseConfig>('universe_configs', 'homepage');
  if (!existing) {
    const def = getDefaultHomepageConfig();
    await dbSet('universe_configs', 'homepage', def);
    return def;
  }
  const mergedOrder = Array.isArray(existing.sectionOrder) && existing.sectionOrder.length > 0
    ? [
        ...existing.sectionOrder,
        ...DEFAULT_SECTION_ORDER.filter((k) => !existing.sectionOrder.includes(k)),
      ]
    : [...DEFAULT_SECTION_ORDER];

  return {
    ...getDefaultHomepageConfig(),
    ...existing,
    sectionOrder: mergedOrder,
    hiddenSections: Array.isArray(existing.hiddenSections) ? existing.hiddenSections : [],
    featuredCollectionIds: Array.isArray(existing.featuredCollectionIds)
      ? existing.featuredCollectionIds
      : [],
    featuredPremiereIds: Array.isArray(existing.featuredPremiereIds)
      ? existing.featuredPremiereIds
      : [],
  };
}

export async function patchHomepageUniverseConfig(
  patch: Partial<HomepageUniverseConfig> & { publishDraft?: boolean; saveDraft?: boolean }
): Promise<HomepageUniverseConfig> {
  const current = await getHomepageUniverseConfig();
  const now = new Date().toISOString();

  if (patch.publishDraft && current.draft) {
    const published: HomepageUniverseConfig = {
      ...current,
      ...current.draft,
      announcementBanner: current.draft.announcementBanner
        ? { ...current.announcementBanner, ...current.draft.announcementBanner }
        : current.announcementBanner,
      draft: null,
      publishedAt: now,
      updatedAt: now,
    };
    await dbSet('universe_configs', 'homepage', published);
    return published;
  }

  if (patch.saveDraft) {
    const nextDraft = {
      ...(current.draft || {}),
      ...patch,
    };
    delete (nextDraft as any).saveDraft;
    delete (nextDraft as any).publishDraft;
    delete (nextDraft as any).id;
    const updated: HomepageUniverseConfig = {
      ...current,
      draft: nextDraft,
      updatedAt: now,
    };
    await dbSet('universe_configs', 'homepage', updated);
    return updated;
  }

  const sanitizedPatch: Partial<HomepageUniverseConfig> = { ...patch };
  delete (sanitizedPatch as any).saveDraft;
  delete (sanitizedPatch as any).publishDraft;
  delete (sanitizedPatch as any).id;

  const updated: HomepageUniverseConfig = {
    ...current,
    ...sanitizedPatch,
    announcementBanner: patch.announcementBanner
      ? { ...current.announcementBanner, ...patch.announcementBanner }
      : current.announcementBanner,
    publishedAt: now,
    updatedAt: now,
  };
  await dbSet('universe_configs', 'homepage', updated);
  return updated;
}

function getDateKeyForTimezone(timezone: string): { dateKey: string; timezone: string } {
  let validTz = 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    validTz = timezone;
  } catch {
    validTz = 'UTC';
  }
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: validTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return { dateKey, timezone: validTz };
}

function deterministicHashInt(seed: string): number {
  const digest = crypto.createHash('sha256').update(seed).digest();
  return digest.readUInt32BE(0);
}

function enrichAnimeMal(anime: AnimeSummary): AnimeSummary {
  const cachedMal = getCachedMalScore(anime.idMal);
  return cachedMal !== null && !anime.malScore ? { ...anime, malScore: cachedMal } : anime;
}

function buildSpotlightReasons(anime: AnimeSummary, isAdminOverride: boolean): string[] {
  const reasons: string[] = [];
  if (isAdminOverride) {
    reasons.push('Hand-picked by AniVerve editorial curators for today’s showcase.');
  }
  if (typeof anime.averageScore === 'number' && anime.averageScore >= 80) {
    reasons.push(`Acclaimed by viewers with an ${anime.averageScore}% AniList rating.`);
  }
  if (anime.status === 'RELEASING' && anime.nextAiringEpisode) {
    reasons.push(`Currently airing — Episode ${anime.nextAiringEpisode.episode} is on schedule.`);
  } else if (anime.format === 'MOVIE') {
    reasons.push('Feature-length anime film selected for a complete single-sitting experience.');
  } else if (anime.seasonYear) {
    reasons.push(
      `Notable ${anime.season ? `${anime.season.charAt(0) + anime.season.slice(1).toLowerCase()} ` : ''}${anime.seasonYear} release${anime.studios?.nodes?.[0]?.name ? ` animated by ${anime.studios.nodes[0].name}` : ''}.`
    );
  }
  if (anime.genres && anime.genres.length > 0) {
    reasons.push(`Blends ${anime.genres.slice(0, 3).join(', ')} themes.`);
  }
  return reasons.slice(0, 3);
}

export async function getAnimeOfTheDay(rawTz = 'UTC'): Promise<AnimeOfTheDayPayload> {
  const { dateKey, timezone } = getDateKeyForTimezone(rawTz);
  const cacheKey = `universe:aotd:${dateKey}`;
  const cached = getCached<AnimeOfTheDayPayload>(cacheKey);
  const config = await getHomepageUniverseConfig();

  if (config.animeOfTheDayOverrideId) {
    const overrideDetail = await getAnimeDetails(config.animeOfTheDayOverrideId).catch(() => null);
    if (overrideDetail) {
      let malScore = overrideDetail.malScore ?? getCachedMalScore(overrideDetail.idMal);
      if (malScore === null && overrideDetail.idMal) {
        const mal = await getMalAnimeInfoWithMeta(overrideDetail.idMal).catch(() => null);
        malScore = mal?.info?.score ?? null;
      }
      const enriched = { ...overrideDetail, malScore };
      return {
        dateKey,
        timezone,
        anime: enriched,
        reasons: buildSpotlightReasons(enriched, true),
        isAdminOverride: true,
      };
    }
  }

  if (cached && !config.animeOfTheDayOverrideId) {
    return { ...cached, timezone };
  }

  const home = await getHomeCollections();
  const seenIds = new Set<number>();
  const pool: AnimeSummary[] = [];
  for (const list of [home.topRated, home.trending, home.popular, home.seasonal, home.recommended]) {
    for (const item of list) {
      if (item && !item.isAdult && item.coverImage?.extraLarge && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        pool.push(item);
      }
    }
  }

  if (pool.length === 0) {
    throw new Error('Catalog unavailable for Anime of the Day.');
  }

  // Avoid repeating picks from the prior 14 calendar days
  const recentIds = new Set<number>();
  const baseDate = new Date(`${dateKey}T12:00:00Z`).getTime();
  for (let d = 1; d <= Math.min(14, pool.length - 1); d++) {
    const prevKey = new Date(baseDate - d * 86400 * 1000).toISOString().slice(0, 10);
    const prevIdx = deterministicHashInt(`aniverve:aotd:${prevKey}`) % pool.length;
    recentIds.add(pool[prevIdx].id);
  }

  const eligible = pool.filter((a) => !recentIds.has(a.id));
  const selectionPool = eligible.length > 0 ? eligible : pool;
  const pickIndex = deterministicHashInt(`aniverve:aotd:${dateKey}`) % selectionPool.length;
  let selected = enrichAnimeMal(selectionPool[pickIndex]);

  if (!selected.malScore && selected.idMal) {
    const mal = await Promise.race([
      getMalAnimeInfoWithMeta(selected.idMal).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
    if (mal?.info?.score) {
      selected = { ...selected, malScore: mal.info.score };
    }
  }

  const payload: AnimeOfTheDayPayload = {
    dateKey,
    timezone,
    anime: selected,
    reasons: buildSpotlightReasons(selected, false),
    isAdminOverride: false,
  };
  setCached(cacheKey, payload, 1800);
  return payload;
}

export async function getSurpriseAnime(excludeGenres: string[] = []): Promise<AnimeSummary> {
  const excludedSet = new Set(excludeGenres.map((g) => g.trim().toLowerCase()).filter(Boolean));
  const home = await getHomeCollections();
  const seenIds = new Set<number>();
  const pool: AnimeSummary[] = [];

  for (const list of [
    home.trending,
    home.popular,
    home.topRated,
    home.seasonal,
    home.recommended,
    home.movies,
  ]) {
    for (const item of list) {
      if (!item || item.isAdult || seenIds.has(item.id)) continue;
      const itemGenres = (item.genres || []).map((g: string) => g.toLowerCase());
      if (itemGenres.some((g: string) => excludedSet.has(g))) continue;
      seenIds.add(item.id);
      pool.push(enrichAnimeMal(item));
    }
  }

  if (pool.length === 0) {
    const fallback = await exploreAnime({ sort: 'POPULARITY_DESC', perPage: 30, page: 1 });
    const filtered = fallback.media.filter(
      (item: AnimeSummary) => !(item.genres || []).some((g: string) => excludedSet.has(g.toLowerCase()))
    );
    if (filtered.length === 0) {
      throw new Error('No eligible anime matched with the excluded genre filters.');
    }
    return enrichAnimeMal(filtered[crypto.randomInt(filtered.length)]);
  }

  return pool[crypto.randomInt(pool.length)];
}

interface OfficialCollectionBlueprint {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  themeTag: string;
  accentHex: string;
  sortOrder: number;
  query: Parameters<typeof exploreAnime>[0];
}

const OFFICIAL_COLLECTION_BLUEPRINTS: OfficialCollectionBlueprint[] = [
  {
    id: 'hidden-gems',
    slug: 'hidden-gems',
    title: 'Hidden Gems',
    subtitle: 'Critically acclaimed picks beyond the mainstream charts',
    description: 'High-rated series favored by dedicated viewers.',
    themeTag: 'Curated',
    accentHex: '#9B87FF',
    sortOrder: 1,
    query: { sort: 'SCORE_DESC', page: 3, perPage: 8 },
  },
  {
    id: 'short-anime-worth-watching',
    slug: 'short-anime-worth-watching',
    title: 'Short Anime Worth Watching',
    subtitle: 'Tight, unforgettable stories under 13 episodes or compact runtimes',
    description: 'Complete arcs you can finish across a weekend.',
    themeTag: 'Binge Ready',
    accentHex: '#7C5CFF',
    sortOrder: 2,
    query: { format: 'TV_SHORT', sort: 'SCORE_DESC', page: 1, perPage: 8 },
  },
  {
    id: 'fantasy-worlds',
    slug: 'fantasy-worlds',
    title: 'Fantasy Worlds',
    subtitle: 'Expansive magic systems, mythic quests, and deep world-building',
    description: 'Sweep across enchanted realms and high-fantasy sagas.',
    themeTag: 'Fantasy',
    accentHex: '#A78BFA',
    sortOrder: 3,
    query: { genre: 'Fantasy', sort: 'SCORE_DESC', page: 1, perPage: 8 },
  },
  {
    id: 'mystery-picks',
    slug: 'mystery-picks',
    title: 'Mystery & Thriller Picks',
    subtitle: 'Mind games, investigative suspense, and layered twists',
    description: 'Stories built for sharp deduction and late-night tension.',
    themeTag: 'Mystery',
    accentHex: '#818CF8',
    sortOrder: 4,
    query: { genre: 'Mystery', sort: 'SCORE_DESC', page: 1, perPage: 8 },
  },
  {
    id: 'beginner-friendly',
    slug: 'beginner-friendly',
    title: 'Beginner Friendly',
    subtitle: 'Accessible modern classics ideal for first-time viewers',
    description: 'Globally beloved series with effortless entry points.',
    themeTag: 'Starter',
    accentHex: '#38BDF8',
    sortOrder: 5,
    query: { sort: 'POPULARITY_DESC', page: 1, perPage: 8 },
  },
  {
    id: 'seasonal-favorites',
    slug: 'seasonal-favorites',
    title: 'Seasonal Favorites',
    subtitle: 'Top-performing simulcasts capturing current season buzz',
    description: 'Fresh weekly episodes trending across the community.',
    themeTag: 'Current Season',
    accentHex: '#C084FC',
    sortOrder: 6,
    query: { status: 'RELEASING', sort: 'TRENDING_DESC', page: 1, perPage: 8 },
  },
  {
    id: 'highly-rated-classics',
    slug: 'highly-rated-classics',
    title: 'Highly Rated Classics',
    subtitle: 'Landmark series and films that defined their eras',
    description: 'Timeless masterpieces with enduring scores.',
    themeTag: 'Classics',
    accentHex: '#F59E0B',
    sortOrder: 7,
    query: { sort: 'SCORE_DESC', page: 1, perPage: 8 },
  },
  {
    id: 'underrated-anime',
    slug: 'underrated-anime',
    title: 'Underrated Anime',
    subtitle: 'Overlooked originals and stylish psychological standouts',
    description: 'Distinctive craft waiting to be discovered.',
    themeTag: 'Spotlight',
    accentHex: '#EC4899',
    sortOrder: 8,
    query: { genre: 'Psychological', sort: 'SCORE_DESC', page: 1, perPage: 8 },
  },
];

let collectionsSeeded = false;
export async function ensureOfficialCollectionsSeeded(): Promise<void> {
  if (collectionsSeeded) return;
  collectionsSeeded = true;
  const existing = await dbList<CuratedCollection>('anime_collections');
  const existingIds = new Set(existing.map((c) => c.id));
  const now = new Date().toISOString();

  for (const bp of OFFICIAL_COLLECTION_BLUEPRINTS) {
    if (!existingIds.has(bp.id)) {
      await dbSet<CuratedCollection>('anime_collections', bp.id, {
        id: bp.id,
        slug: bp.slug,
        title: bp.title,
        subtitle: bp.subtitle,
        description: bp.description,
        themeTag: bp.themeTag,
        accentHex: bp.accentHex,
        anilistIds: [],
        isOfficial: true,
        published: true,
        sortOrder: bp.sortOrder,
        updatedAt: now,
      });
    }
  }
}

export async function listCuratedCollections(options?: {
  includeUnpublished?: boolean;
  hydrateItems?: boolean;
}): Promise<CuratedCollection[]> {
  await ensureOfficialCollectionsSeeded();
  const rows = await dbList<CuratedCollection>('anime_collections');
  const filtered = rows
    .filter((c) => options?.includeUnpublished || c.published !== false)
    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));

  if (!options?.hydrateItems) {
    return filtered;
  }

  const hydrated = await Promise.all(
    filtered.map(async (col) => {
      const cacheKey = `universe:col:${col.id}:${(col.anilistIds || []).join(',')}`;
      const cachedItems = getCached<AnimeSummary[]>(cacheKey);
      if (cachedItems) {
        return { ...col, items: cachedItems };
      }

      if (Array.isArray(col.anilistIds) && col.anilistIds.length > 0) {
        const fetched = await Promise.all(
          col.anilistIds.slice(0, 8).map((id) => getAnimeDetails(id).catch(() => null))
        );
        const items = fetched.filter((x): x is NonNullable<typeof x> => Boolean(x)).map(enrichAnimeMal);
        setCached(cacheKey, items, 900);
        return { ...col, items };
      }

      const bp = OFFICIAL_COLLECTION_BLUEPRINTS.find((b) => b.id === col.id);
      if (bp) {
        try {
          const res = await exploreAnime(bp.query);
          const items = res.media.slice(0, 8).map(enrichAnimeMal);
          setCached(cacheKey, items, 900);
          return { ...col, items };
        } catch {
          return { ...col, items: [] };
        }
      }

      return { ...col, items: [] };
    })
  );

  return hydrated;
}

function getIsoWeekKey(date = new Date()): string {
  const temp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((temp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${temp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export async function getActiveFaceOff(userId?: string | null): Promise<FaceOffMatchup> {
  const weekKey = getIsoWeekKey();
  const config = await getHomepageUniverseConfig();
  const home = await getHomeCollections();

  let animeA: AnimeSummary | null = null;
  let animeB: AnimeSummary | null = null;

  if (
    Array.isArray(config.faceOffOverrideIds) &&
    config.faceOffOverrideIds.length === 2 &&
    config.faceOffOverrideIds[0] !== config.faceOffOverrideIds[1]
  ) {
    const [a, b] = await Promise.all([
      getAnimeDetails(config.faceOffOverrideIds[0]).catch(() => null),
      getAnimeDetails(config.faceOffOverrideIds[1]).catch(() => null),
    ]);
    if (a && b) {
      animeA = a;
      animeB = b;
    }
  }

  if (!animeA || !animeB) {
    const pool = [...home.topRated, ...home.popular].filter(
      (a, idx, arr) => a && !a.isAdult && arr.findIndex((x) => x.id === a.id) === idx
    );
    if (pool.length < 2) {
      throw new Error('Not enough anime available for face-off matchup.');
    }
    const seed = deterministicHashInt(`faceoff:${weekKey}`);
    const idxA = seed % pool.length;
    let idxB = (seed * 7 + 3) % pool.length;
    if (idxB === idxA) idxB = (idxA + 1) % pool.length;
    animeA = enrichAnimeMal(pool[idxA]);
    animeB = enrichAnimeMal(pool[idxB]);
  }

  const matchupId = `faceoff_${weekKey}_${animeA.id}_vs_${animeB.id}`;
  const votes = await dbList<{ userId: string; matchupId: string; winnerAnilistId: number }>(
    'anime_faceoff_votes',
    (v) => v.matchupId === matchupId
  );

  let votesA = 0;
  let votesB = 0;
  let userVoteAnilistId: number | null = null;
  for (const v of votes) {
    if (v.winnerAnilistId === animeA.id) votesA++;
    else if (v.winnerAnilistId === animeB.id) votesB++;
    if (userId && v.userId === userId) {
      userVoteAnilistId = v.winnerAnilistId;
    }
  }

  return {
    id: matchupId,
    weekKey,
    title: 'Weekly AniVerve Face-Off',
    animeA,
    animeB,
    votesA,
    votesB,
    totalVotes: votesA + votesB,
    userVoteAnilistId,
  };
}

export async function submitFaceOffVote(
  userId: string,
  matchupId: string,
  winnerAnilistId: number
): Promise<FaceOffMatchup> {
  const current = await getActiveFaceOff(userId);
  if (current.id !== matchupId) {
    throw new Error('This matchup is no longer active.');
  }
  if (winnerAnilistId !== current.animeA.id && winnerAnilistId !== current.animeB.id) {
    throw new Error('Selected anime is not part of the active matchup.');
  }

  const voteDocId = `${userId}_${matchupId}`;
  const existing = await dbGet('anime_faceoff_votes', voteDocId);
  if (existing) {
    throw new Error('You have already voted in this Face-Off matchup.');
  }

  await dbSet('anime_faceoff_votes', voteDocId, {
    id: voteDocId,
    userId,
    matchupId,
    winnerAnilistId,
    createdAt: new Date().toISOString(),
  });

  return getActiveFaceOff(userId);
}

export async function universalSearch(queryText: string): Promise<UniversalSearchResult> {
  const clean = queryText.trim();
  if (!clean) {
    return {
      query: '',
      anime: [],
      characters: [],
      studios: [],
      genres: [],
      collections: [],
    };
  }

  const lower = clean.toLowerCase();
  const [catalogRes, collections] = await Promise.all([
    universalSearchCatalog(clean),
    listCuratedCollections({ hydrateItems: false }),
  ]);

  const matchedGenres = ALL_KNOWN_GENRES.filter((g) => g.toLowerCase().includes(lower)).slice(0, 6);
  const matchedCollections = collections
    .filter(
      (c) =>
        c.title.toLowerCase().includes(lower) ||
        c.subtitle.toLowerCase().includes(lower) ||
        c.themeTag.toLowerCase().includes(lower)
    )
    .slice(0, 4);

  return {
    query: clean,
    anime: catalogRes.anime.map(enrichAnimeMal),
    characters: catalogRes.characters,
    studios: catalogRes.studios,
    genres: matchedGenres,
    collections: matchedCollections,
  };
}

export interface RealAchievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  progress: number;
  target: number;
  category: 'watching' | 'curation' | 'community';
}

export async function buildUserUniverseSummary(userId: string) {
  const [watchlist, favorites, history, ratings, reminders, userCollections, faceOffVotes] =
    await Promise.all([
      dbList<WatchlistItem>('watchlists', (w) => w.userId === userId),
      dbList<FavoriteItem>('favorites', (f) => f.userId === userId),
      dbList<WatchHistoryItem>('watch_history', (h) => h.userId === userId),
      dbList<UserRatingItem>('user_ratings', (r) => r.userId === userId),
      dbList('premiere_reminders', (p: any) => p.userId === userId),
      dbList('user_collections', (c: any) => c.userId === userId),
      dbList('anime_faceoff_votes', (v: any) => v.userId === userId),
    ]);

  const completedSeries = watchlist.filter((w) => w.status === 'COMPLETED').length;
  const watchingSeries = watchlist.filter((w) => w.status === 'WATCHING').length;
  const uniqueAnimeWatched = new Set(history.map((h) => h.anilistId)).size;
  const totalSecondsWatched = history.reduce(
    (sum, item) => sum + (Number.isFinite(item.progressSec) ? item.progressSec : 0),
    0
  );
  const episodesLogged = new Set(history.map((h) => `${h.anilistId}_${h.episodeNumber}`)).size;
  const avgRating =
    ratings.length > 0
      ? Number((ratings.reduce((s, r) => s + r.score, 0) / ratings.length).toFixed(1))
      : null;

  // Derive top genres purely from real anime details of watchlist/favorites/history
  const sampleIds = Array.from(
    new Set([
      ...favorites.map((f) => f.anilistId),
      ...watchlist.map((w) => w.anilistId),
      ...history.map((h) => h.anilistId),
    ])
  ).slice(0, 12);

  const genreCounts = new Map<string, number>();
  const detailResults = await Promise.all(
    sampleIds.map((id) => getAnimeDetails(id).catch(() => null))
  );
  for (const anime of detailResults) {
    if (!anime?.genres) continue;
    for (const g of anime.genres) {
      genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
    }
  }
  const favoriteGenres = Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([genre, count]) => ({ genre, count }));

  // Genuine milestone achievements strictly computed from user DB activity
  const achievements: RealAchievement[] = [
    {
      id: 'first-episode',
      title: 'First Signal',
      description: 'Watch your first episode on AniVerve.',
      unlocked: episodesLogged >= 1,
      progress: Math.min(episodesLogged, 1),
      target: 1,
      category: 'watching',
    },
    {
      id: 'marathon-10',
      title: 'Episode Voyager',
      description: 'Log 10 unique episodes in Watch History.',
      unlocked: episodesLogged >= 10,
      progress: Math.min(episodesLogged, 10),
      target: 10,
      category: 'watching',
    },
    {
      id: 'series-finisher',
      title: 'Arc Finisher',
      description: 'Complete at least 3 anime series in your Watchlist.',
      unlocked: completedSeries >= 3,
      progress: Math.min(completedSeries, 3),
      target: 3,
      category: 'curation',
    },
    {
      id: 'curator-collection',
      title: 'Universe Curator',
      description: 'Create a custom personal anime collection.',
      unlocked: userCollections.length >= 1,
      progress: Math.min(userCollections.length, 1),
      target: 1,
      category: 'curation',
    },
    {
      id: 'critic-voice',
      title: 'Signal Critic',
      description: 'Submit 5 personal anime ratings.',
      unlocked: ratings.length >= 5,
      progress: Math.min(ratings.length, 5),
      target: 5,
      category: 'community',
    },
    {
      id: 'faceoff-voter',
      title: 'Arena Voter',
      description: 'Cast a verified vote in Anime Face-Off.',
      unlocked: faceOffVotes.length >= 1,
      progress: Math.min(faceOffVotes.length, 1),
      target: 1,
      category: 'community',
    },
  ];

  // Real recommendations based on top favorite genre from catalog (excluding already tracked titles)
  let personalizedRecommendations: AnimeSummary[] = [];
  if (favoriteGenres.length > 0) {
    try {
      const topGenre = favoriteGenres[0].genre;
      const res = await exploreAnime({ genre: topGenre, sort: 'SCORE_DESC', perPage: 12, page: 1 });
      const trackedSet = new Set([
        ...watchlist.map((w) => w.anilistId),
        ...favorites.map((f) => f.anilistId),
      ]);
      personalizedRecommendations = res.media
        .filter((a: AnimeSummary) => !trackedSet.has(a.id))
        .slice(0, 6)
        .map(enrichAnimeMal);
    } catch {
      personalizedRecommendations = [];
    }
  }

  return {
    stats: {
      watchlistCount: watchlist.length,
      watchingCount: watchingSeries,
      completedCount: completedSeries,
      favoritesCount: favorites.length,
      episodesLogged,
      uniqueAnimeWatched,
      hoursWatched: Number((totalSecondsWatched / 3600).toFixed(1)),
      ratingsCount: ratings.length,
      averageRating: avgRating,
      remindersCount: reminders.length,
      collectionsCount: userCollections.length,
    },
    favoriteGenres,
    achievements,
    personalizedRecommendations,
  };
}

export async function createAdminNotification(input: {
  severity: AdminNotificationItem['severity'];
  category: AdminNotificationItem['category'];
  title: string;
  message: string;
}): Promise<AdminNotificationItem> {
  const item: AdminNotificationItem = {
    id: crypto.randomUUID(),
    severity: input.severity,
    category: input.category,
    title: input.title.slice(0, 140),
    message: input.message.slice(0, 400),
    acknowledged: false,
    createdAt: new Date().toISOString(),
  };
  await dbSet('admin_notifications', item.id, item);
  return item;
}

export async function listAdminNotifications(): Promise<AdminNotificationItem[]> {
  const rows = await dbList<AdminNotificationItem>('admin_notifications');
  return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
