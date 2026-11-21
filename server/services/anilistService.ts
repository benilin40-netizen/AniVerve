import { buildAnimeSlug } from '../../src/utils/slug.ts';
import type {
  AiringScheduleItem,
  AnimeCharacterSpotlight,
  AnimeDetail,
  AnimeIdMapping,
  AnimeSummary,
  AnimeTag,
  DataProvenanceMeta,
  HomeDiscoveryCategory,
} from '../../src/types/anime.ts';
import { cleanEnv } from '../utils/env.ts';
import { dedupeInFlight, parseRetryAfterMs, reliableFetch, TIMEOUTS } from '../utils/httpClient.ts';
import {
  getCachedWithMeta,
  getStaleFallbackWithMeta,
  recordApiMetric,
  setCached,
} from './cacheService.ts';

const ANILIST_ENDPOINT = cleanEnv(process.env.ANILIST_API_URL, 'https://graphql.anilist.co');

const MEDIA_CARD_FRAGMENT = `
  id
  idMal
  title {
    romaji
    english
    native
    userPreferred
  }
  format
  status
  season
  seasonYear
  startDate {
    year
    month
    day
  }
  episodes
  duration
  averageScore
  popularity
  genres
  isAdult
  coverImage {
    extraLarge
    large
    medium
    color
  }
  bannerImage
  description(asHtml: false)
  trailer {
    id
    site
    thumbnail
  }
  studios(isMain: true) {
    nodes {
      id
      name
      isAnimationStudio
    }
  }
  nextAiringEpisode {
    id
    airingAt
    timeUntilAiring
    episode
  }
`;

function mapAnimeSummary(raw: any): AnimeSummary {
  return {
    ...raw,
    slug: buildAnimeSlug(raw.id, raw.title),
  };
}

function getTomorrowFuzzyDateInt(): number {
  const tomorrow = new Date(Date.now() + 86_400_000);
  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const day = String(tomorrow.getDate()).padStart(2, '0');
  return Number(`${year}${month}${day}`);
}

let rateLimitedUntil = 0;

async function queryAniListWithMeta<T>(
  query: string,
  variables: Record<string, any>,
  cacheKey: string,
  ttlSeconds = 300,
  bypassCache = false
): Promise<{ data: T; meta: DataProvenanceMeta }> {
  const cached = !bypassCache ? getCachedWithMeta<T>(cacheKey) : null;
  if (cached) {
    return {
      data: cached.data,
      meta: {
        source: 'anilist',
        fetchedAt: new Date(cached.updatedAt).toISOString(),
        isStale: false,
        notice: null,
      },
    };
  }

  const fallback = getStaleFallbackWithMeta<T>(cacheKey);
  if (Date.now() < rateLimitedUntil && fallback) {
    return {
      data: fallback.data,
      meta: {
        source: 'cache-fallback',
        fetchedAt: new Date(fallback.updatedAt).toISOString(),
        isStale: true,
        notice: 'AniList rate limit cooldown active; displaying last cached snapshot.',
      },
    };
  }

  return dedupeInFlight(`anilist:${cacheKey}`, async () => {
    const start = Date.now();
    try {
      const res = await reliableFetch(ANILIST_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query, variables }),
        timeoutMs: TIMEOUTS.CATALOG_MS,
        maxAttempts: 3,
        onAttemptFailed: ({ status, message, latencyMs }) => {
          if (status === 429) {
            rateLimitedUntil = Date.now() + 10_000;
          }
          recordApiMetric('AniList GraphQL', false, latencyMs, message);
        },
      });

      if (res.status === 429) {
        const retryMs = parseRetryAfterMs(res.headers.get('retry-after')) || 10_000;
        rateLimitedUntil = Date.now() + retryMs;
        throw new Error(`AniList rate limit reached (429). Retry after ${Math.ceil(retryMs / 1000)}s.`);
      }

      if (!res.ok) {
        throw new Error(`AniList HTTP ${res.status}: ${res.statusText}`);
      }

      const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
      if (json.errors?.length) {
        throw new Error(json.errors.map((e) => e.message).join('; '));
      }
      if (!json.data) {
        throw new Error('AniList returned empty data');
      }

      recordApiMetric('AniList GraphQL', true, Date.now() - start);
      setCached(cacheKey, json.data, ttlSeconds);
      return {
        data: json.data,
        meta: {
          source: 'anilist',
          fetchedAt: new Date().toISOString(),
          isStale: false,
          notice: null,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      recordApiMetric('AniList GraphQL', false, Date.now() - start, msg);

      if (fallback) {
        return {
          data: fallback.data,
          meta: {
            source: 'cache-fallback',
            fetchedAt: new Date(fallback.updatedAt).toISOString(),
            isStale: true,
            notice: `AniList temporarily unavailable (${msg}); displaying cached data.`,
          },
        };
      }

      throw new Error(`Unable to load data from AniList: ${msg}`);
    }
  });
}

async function fetchRecentlyUpdated(): Promise<AnimeSummary[]> {
  const nowUnix = Math.floor(Date.now() / 1000);
  const windows = [7, 14, 30];
  let processedItems: AnimeSummary[] = [];

  const query = `
    query RecentlyUpdatedAiring($greater: Int, $lesser: Int) {
      Page(page: 1, perPage: 50) {
        airingSchedules(airingAt_greater: $greater, airingAt_lesser: $lesser, sort: TIME_DESC) {
          airingAt
          episode
          media {
            id
            idMal
            title {
              romaji
              english
              native
              userPreferred
            }
            format
            status
            season
            seasonYear
            episodes
            duration
            averageScore
            popularity
            genres
            isAdult
            coverImage {
              extraLarge
              large
              medium
              color
            }
            bannerImage
            description(asHtml: false)
          }
        }
      }
    }
  `;

  for (const days of windows) {
    const greater = nowUnix - days * 86400;
    const lesser = nowUnix;
    try {
      const cacheKey = `anilist:recently_updated:${days}d`;
      const { data } = await queryAniListWithMeta<any>(
        query,
        { greater, lesser },
        cacheKey,
        600
      );

      const schedules = data?.Page?.airingSchedules || [];
      const seenMediaIds = new Set<number>();
      const batchItems: AnimeSummary[] = [];

      for (const sched of schedules) {
        const media = sched?.media;
        if (!media || media.isAdult) continue;
        if (seenMediaIds.has(media.id)) continue;

        if (media.status !== 'RELEASING' && media.status !== 'FINISHED') continue;

        const fmt = media.format;
        if (!['TV', 'TV_SHORT', 'ONA', 'MOVIE'].includes(fmt)) continue;

        seenMediaIds.add(media.id);
        batchItems.push({
          ...mapAnimeSummary(media),
          latestEpisode: sched.episode,
          airingAt: sched.airingAt,
        });
      }

      processedItems = batchItems;
      if (processedItems.length >= 12 || days === 30) {
        break;
      }
    } catch (err) {
      console.error(`Failed to fetch recently updated with window ${days}d:`, err);
    }
  }

  return processedItems;
}




export async function getHomeCollections() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const season =
    month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';
  const movieMaxDate = getTomorrowFuzzyDateInt();

  const query = `
    query HomeCollections($season: MediaSeason, $seasonYear: Int, $movieMaxDate: FuzzyDateInt) {
      trending: Page(page: 1, perPage: 15) {
        media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      popular: Page(page: 1, perPage: 15) {
        media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      topRated: Page(page: 1, perPage: 15) {
        media(type: ANIME, sort: SCORE_DESC, isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      seasonal: Page(page: 1, perPage: 15) {
        media(type: ANIME, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC, isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      upcoming: Page(page: 1, perPage: 12) {
        media(type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC, isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      airing: Page(page: 1, perPage: 12) {
        media(type: ANIME, status: RELEASING, sort: TRENDING_DESC, isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      recommended: Page(page: 1, perPage: 12) {
        media(type: ANIME, sort: [FAVOURITES_DESC, SCORE_DESC], isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      movies: Page(page: 1, perPage: 12) {
        media(
          type: ANIME,
          format: MOVIE,
          startDate_greater: 19500101,
          startDate_lesser: $movieMaxDate,
          sort: [START_DATE_DESC, POPULARITY_DESC],
          isAdult: false
        ) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
    }
  `;

  const [homeResult, recentlyUpdatedItems] = await Promise.all([
    queryAniListWithMeta<any>(
      query,
      { season, seasonYear: year, movieMaxDate },
      `anilist:home:${season}:${year}:${movieMaxDate}`,
      600
    ),
    fetchRecentlyUpdated().catch((err) => {
      console.error('Recently updated fetch failed:', err);
      return [];
    }),
  ]);

  const data = homeResult.data;

  return {
    season,
    seasonYear: year,
    _meta: homeResult.meta,
    trending: (data.trending?.media || []).map(mapAnimeSummary),
    popular: (data.popular?.media || []).map(mapAnimeSummary),
    topRated: (data.topRated?.media || []).map(mapAnimeSummary),
    seasonal: (data.seasonal?.media || []).map(mapAnimeSummary),
    upcoming: (data.upcoming?.media || []).map(mapAnimeSummary),
    airing: (data.airing?.media || []).map(mapAnimeSummary),
    recentlyUpdated: recentlyUpdatedItems,
    recommended: (data.recommended?.media || []).map(mapAnimeSummary),
    movies: (data.movies?.media || []).map(mapAnimeSummary),
  };
}

export interface ExploreParams {
  search?: string;
  genre?: string;
  tag?: string;
  year?: number;
  season?: string;
  format?: string;
  status?: string;
  sort?: string;
  page?: number;
  perPage?: number;
}

export async function exploreAnime(params: ExploreParams) {
  const page = Math.max(1, params.page || 1);
  const perPage = Math.min(36, Math.max(1, params.perPage || 24));
  const sort = params.sort || (params.search ? 'SEARCH_MATCH' : 'TRENDING_DESC');

  const sortList = sort === 'START_DATE_DESC' ? ['START_DATE_DESC', 'POPULARITY_DESC'] : [sort];
  const variables: Record<string, any> = {
    page,
    perPage,
    sort: sortList,
  };
  if (params.search?.trim()) variables.search = params.search.trim();
  if (params.genre && params.genre !== 'ALL') variables.genre = params.genre;
  if (params.tag && params.tag !== 'ALL') variables.tag = params.tag.trim();
  if (params.year) variables.seasonYear = params.year;
  if (params.season && params.season !== 'ALL') variables.season = params.season;
  if (params.format && params.format !== 'ALL') variables.format = params.format;
  if (params.status && params.status !== 'ALL') variables.status = params.status;
  if (
    sort === 'START_DATE_DESC' &&
    params.status !== 'NOT_YET_RELEASED' &&
    !params.search?.trim()
  ) {
    variables.startDateGreater = 19500101;
    variables.startDateLesser = getTomorrowFuzzyDateInt();
  }

  const query = `
    query ExploreAnime(
      $page: Int,
      $perPage: Int,
      $search: String,
      $genre: String,
      $tag: String,
      $seasonYear: Int,
      $season: MediaSeason,
      $format: MediaFormat,
      $status: MediaStatus,
      $startDateGreater: FuzzyDateInt,
      $startDateLesser: FuzzyDateInt,
      $sort: [MediaSort]
    ) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          currentPage
          lastPage
          hasNextPage
          perPage
        }
        media(
          type: ANIME,
          isAdult: false,
          search: $search,
          genre: $genre,
          tag: $tag,
          seasonYear: $seasonYear,
          season: $season,
          format: $format,
          status: $status,
          startDate_greater: $startDateGreater,
          startDate_lesser: $startDateLesser,
          sort: $sort
        ) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
    }
  `;

  const cacheKey = `anilist:explore:${JSON.stringify(variables)}`;
  const { data, meta } = await queryAniListWithMeta<any>(query, variables, cacheKey, 300);

  return {
    _meta: meta,
    pageInfo: data.Page?.pageInfo || {
      total: 0,
      currentPage: page,
      lastPage: 1,
      hasNextPage: false,
      perPage,
    },
    media: (data.Page?.media || []).map(mapAnimeSummary),
  };
}

export async function searchAnimeQuick(search: string, limit = 8): Promise<AnimeSummary[]> {
  if (!search.trim()) return [];
  const res = await exploreAnime({ search, perPage: limit, page: 1, sort: 'POPULARITY_DESC' });
  return res.media;
}

export async function getAnimeDetailsWithMeta(
  id: number
): Promise<{ anime: AnimeDetail | null; meta: DataProvenanceMeta }> {
  const query = `
    query AnimeDetails($id: Int) {
      Media(id: $id, type: ANIME, isAdult: false) {
        ${MEDIA_CARD_FRAGMENT}
        endDate { year month day }
        source
        countryOfOrigin
        meanScore
        favourites
        tags {
          id
          name
          description
          category
          rank
          isGeneralSpoiler
          isMediaSpoiler
          isAdult
        }
        allStudios: studios {
          nodes {
            id
            name
            isAnimationStudio
          }
        }
        streamingEpisodes {
          title
          thumbnail
          url
          site
        }
        characters(sort: [ROLE, RELEVANCE, ID], page: 1, perPage: 16) {
          edges {
            id
            role
            node {
              id
              name { full native }
              image { large medium }
            }
            voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) {
              id
              name { full }
              languageV2
              image { medium }
            }
          }
        }
        staff(sort: [RELEVANCE, ID], page: 1, perPage: 10) {
          edges {
            id
            role
            node {
              id
              name { full }
              image { medium }
            }
          }
        }
        relations {
          edges {
            id
            relationType
            node {
              ${MEDIA_CARD_FRAGMENT}
            }
          }
        }
        recommendations(sort: [RATING_DESC, ID], page: 1, perPage: 12) {
          nodes {
            id
            rating
            mediaRecommendation {
              ${MEDIA_CARD_FRAGMENT}
            }
          }
        }
      }
    }
  `;

  const { data, meta } = await queryAniListWithMeta<{ Media: any }>(
    query,
    { id },
    `anilist:detail:${id}`,
    900
  );

  if (!data.Media) return { anime: null, meta };
  const media = data.Media;
  const normalizedTags: AnimeTag[] = Array.isArray(media.tags)
    ? media.tags.filter((t: AnimeTag) => t && !t.isAdult && !t.isMediaSpoiler && !t.isGeneralSpoiler)
    : [];
  const mergedStudios =
    media.allStudios?.nodes?.length > 0 ? media.allStudios : media.studios;

  return {
    meta,
    anime: {
      ...media,
      studios: mergedStudios,
      tags: normalizedTags,
      slug: buildAnimeSlug(media.id, media.title),
      relations: {
        edges: (media.relations?.edges || [])
          .filter((e: any) => e.node && !e.node.isAdult)
          .map((e: any) => ({
            ...e,
            node: mapAnimeSummary(e.node),
          })),
      },
      recommendations: {
        nodes: (media.recommendations?.nodes || [])
          .filter((n: any) => n.mediaRecommendation && !n.mediaRecommendation.isAdult)
          .map((n: any) => ({
            ...n,
            mediaRecommendation: mapAnimeSummary(n.mediaRecommendation),
          })),
      },
    },
  };
}

export async function getAnimeDetails(id: number): Promise<AnimeDetail | null> {
  const res = await getAnimeDetailsWithMeta(id);
  return res.anime;
}

export async function resolveAnimeIds(params: {
  anilistId?: number;
  malId?: number;
}): Promise<AnimeIdMapping | null> {
  const anilistId =
    params.anilistId && Number.isInteger(params.anilistId) && params.anilistId > 0
      ? params.anilistId
      : undefined;
  const malId =
    params.malId && Number.isInteger(params.malId) && params.malId > 0
      ? params.malId
      : undefined;

  if (!anilistId && !malId) return null;

  const cacheKey = anilistId
    ? `anilist:idmap:ani:${anilistId}`
    : `anilist:idmap:mal:${malId}`;

  const query = anilistId
    ? `
      query ResolveByAniListId($id: Int) {
        Media(id: $id, type: ANIME, isAdult: false) {
          id
          idMal
          title { romaji english native userPreferred }
          format
          status
          episodes
        }
      }
    `
    : `
      query ResolveByMalId($idMal: Int) {
        Media(idMal: $idMal, type: ANIME, isAdult: false) {
          id
          idMal
          title { romaji english native userPreferred }
          format
          status
          episodes
        }
      }
    `;

  const variables = anilistId ? { id: anilistId } : { idMal: malId };
  const { data, meta } = await queryAniListWithMeta<{ Media: any }>(
    query,
    variables,
    cacheKey,
    3600
  );

  if (!data?.Media) return null;
  const m = data.Media;
  const mapping: AnimeIdMapping = {
    anilistId: m.id,
    malId: m.idMal ?? null,
    slug: buildAnimeSlug(m.id, m.title),
    title: m.title,
    format: m.format ?? null,
    status: m.status ?? null,
    episodes: m.episodes ?? null,
    source: meta.source === 'cache-fallback' ? 'cache-fallback' : 'anilist',
    fetchedAt: meta.fetchedAt,
  };

  // Cross-populate reverse lookup key when both IDs exist so subsequent lookups hit cache cleanly
  if (mapping.anilistId) {
    setCached(`anilist:idmap:ani:${mapping.anilistId}`, { Media: m }, 3600);
  }
  if (mapping.malId) {
    setCached(`anilist:idmap:mal:${mapping.malId}`, { Media: m }, 3600);
  }

  return mapping;
}

export async function getAiringSchedule(
  airingAtGreater: number,
  airingAtLesser: number,
  page = 1,
  perPage = 50
): Promise<{ pageInfo: any; schedules: AiringScheduleItem[]; _meta: DataProvenanceMeta }> {
  const query = `
    query AiringSchedule($page: Int, $perPage: Int, $greater: Int, $lesser: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          currentPage
          lastPage
          hasNextPage
        }
        airingSchedules(airingAt_greater: $greater, airingAt_lesser: $lesser, sort: TIME) {
          id
          airingAt
          timeUntilAiring
          episode
          media {
            ${MEDIA_CARD_FRAGMENT}
          }
        }
      }
    }
  `;

  const cacheKey = `anilist:schedule:${airingAtGreater}:${airingAtLesser}:${page}:${perPage}`;
  const { data, meta } = await queryAniListWithMeta<any>(
    query,
    { page, perPage, greater: airingAtGreater, lesser: airingAtLesser },
    cacheKey,
    180
  );

  const seen = new Set<string>();
  const schedules: AiringScheduleItem[] = [];

  for (const item of data.Page?.airingSchedules || []) {
    if (!item.media || item.media.isAdult) continue;
    const dedupeKey = `${item.media.id}-${item.episode}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    schedules.push({
      id: item.id,
      airingAt: item.airingAt,
      timeUntilAiring: item.timeUntilAiring,
      episode: item.episode,
      media: mapAnimeSummary(item.media),
    });
  }

  return {
    _meta: meta,
    pageInfo: data.Page?.pageInfo || { total: schedules.length, currentPage: page, hasNextPage: false },
    schedules,
  };
}

export async function getCharacterSpotlights(
  page = 1,
  perPage = 12
): Promise<{ characters: AnimeCharacterSpotlight[]; _meta: DataProvenanceMeta }> {
  const query = `
    query CharacterSpotlights($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        characters(sort: [FAVOURITES_DESC, ID]) {
          id
          name {
            full
            native
          }
          image {
            large
            medium
          }
          description(asHtml: false)
          favourites
          media(type: ANIME, sort: POPULARITY_DESC, page: 1, perPage: 3) {
            edges {
              characterRole
              node {
                ${MEDIA_CARD_FRAGMENT}
              }
            }
          }
        }
      }
    }
  `;

  const cacheKey = `anilist:characters:spotlight:${page}:${perPage}`;
  const { data, meta } = await queryAniListWithMeta<any>(query, { page, perPage }, cacheKey, 1800);

  const characters: AnimeCharacterSpotlight[] = (data?.Page?.characters || [])
    .filter((c: any) => c && (c.image?.large || c.image?.medium))
    .map((c: any) => {
      const edges = Array.isArray(c.media?.edges) ? c.media.edges : [];
      const anime = edges
        .map((e: any) => e?.node)
        .filter((m: any) => m && !m.isAdult)
        .map(mapAnimeSummary);
      const role = edges[0]?.characterRole || null;
      return {
        id: c.id,
        name: c.name?.full || 'Unknown Character',
        nativeName: c.name?.native || null,
        image: c.image?.large || c.image?.medium || null,
        favourites: typeof c.favourites === 'number' ? c.favourites : null,
        description: c.description
          ? String(c.description)
              .replace(/~![\s\S]*?!~/g, '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 320)
          : null,
        role,
        anime,
      };
    })
    .filter((c: AnimeCharacterSpotlight) => c.anime.length > 0);

  return { characters, _meta: meta };
}

export async function universalSearchCatalog(queryText: string): Promise<{
  anime: AnimeSummary[];
  characters: AnimeCharacterSpotlight[];
  studios: Array<{ id: number; name: string; animeCount?: number; topAnime: AnimeSummary[] }>;
}> {
  const clean = queryText.trim();
  if (!clean) {
    return { anime: [], characters: [], studios: [] };
  }

  const query = `
    query UniversalSearch($search: String) {
      animePage: Page(page: 1, perPage: 10) {
        media(type: ANIME, search: $search, isAdult: false, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      charPage: Page(page: 1, perPage: 6) {
        characters(search: $search, sort: [SEARCH_MATCH, FAVOURITES_DESC]) {
          id
          name { full native }
          image { large medium }
          favourites
          media(type: ANIME, sort: POPULARITY_DESC, page: 1, perPage: 2) {
            edges {
              characterRole
              node {
                ${MEDIA_CARD_FRAGMENT}
              }
            }
          }
        }
      }
      studioPage: Page(page: 1, perPage: 5) {
        studios(search: $search, sort: [SEARCH_MATCH, FAVOURITES_DESC]) {
          id
          name
          isAnimationStudio
          media(sort: POPULARITY_DESC, page: 1, perPage: 3, isMain: true) {
            nodes {
              ${MEDIA_CARD_FRAGMENT}
            }
          }
        }
      }
    }
  `;

  const cacheKey = `anilist:universal:${clean.toLowerCase()}`;
  const { data } = await queryAniListWithMeta<any>(query, { search: clean }, cacheKey, 300);

  const anime: AnimeSummary[] = (data?.animePage?.media || []).map(mapAnimeSummary);
  const characters: AnimeCharacterSpotlight[] = (data?.charPage?.characters || [])
    .filter((c: any) => c && (c.image?.large || c.image?.medium))
    .map((c: any) => {
      const edges = Array.isArray(c.media?.edges) ? c.media.edges : [];
      return {
        id: c.id,
        name: c.name?.full || 'Character',
        nativeName: c.name?.native || null,
        image: c.image?.large || c.image?.medium || null,
        favourites: typeof c.favourites === 'number' ? c.favourites : null,
        description: null,
        role: edges[0]?.characterRole || null,
        anime: edges
          .map((e: any) => e?.node)
          .filter((m: any) => m && !m.isAdult)
          .map(mapAnimeSummary),
      };
    });

  const studios = (data?.studioPage?.studios || [])
    .filter((s: any) => s && s.name)
    .map((s: any) => {
      const topAnime = (s.media?.nodes || [])
        .filter((m: any) => m && !m.isAdult)
        .map(mapAnimeSummary);
      return {
        id: s.id,
        name: s.name,
        animeCount: topAnime.length,
        topAnime,
      };
    });

  return { anime, characters, studios };
}

export async function getDiscoveryCategories(): Promise<{
  categories: HomeDiscoveryCategory[];
  _meta: DataProvenanceMeta;
}> {
  const nowYear = new Date().getFullYear();
  const recentThreshold = Number(`${nowYear - 2}0101`);

  const batchAQuery = `
    query DiscoveryCategoriesBatchA {
      topRated: Page(page: 1, perPage: 12) {
        media(type: ANIME, sort: SCORE_DESC, isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      mostWatched: Page(page: 1, perPage: 12) {
        media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      hiddenGems: Page(page: 1, perPage: 12) {
        media(type: ANIME, averageScore_greater: 78, popularity_lesser: 85000, sort: SCORE_DESC, isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      bestRomance: Page(page: 1, perPage: 12) {
        media(type: ANIME, genre: "Romance", sort: SCORE_DESC, isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      bestAction: Page(page: 1, perPage: 12) {
        media(type: ANIME, genre: "Action", sort: SCORE_DESC, isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      fantasyIsekai: Page(page: 1, perPage: 12) {
        media(type: ANIME, genre: "Fantasy", sort: POPULARITY_DESC, isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
    }
  `;

  const batchBQuery = `
    query DiscoveryCategoriesBatchB($recentThreshold: FuzzyDateInt) {
      mysteryThriller: Page(page: 1, perPage: 12) {
        media(type: ANIME, genre_in: ["Mystery", "Thriller"], sort: SCORE_DESC, isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      comedySliceOfLife: Page(page: 1, perPage: 12) {
        media(type: ANIME, genre_in: ["Comedy", "Slice of Life"], sort: SCORE_DESC, isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      sciFiSupernatural: Page(page: 1, perPage: 12) {
        media(type: ANIME, genre_in: ["Sci-Fi", "Supernatural"], sort: SCORE_DESC, isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      classicAnime: Page(page: 1, perPage: 12) {
        media(type: ANIME, startDate_lesser: 20100101, sort: [SCORE_DESC, POPULARITY_DESC], isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
      newReleases: Page(page: 1, perPage: 12) {
        media(type: ANIME, status_in: [RELEASING, FINISHED], startDate_greater: $recentThreshold, sort: [START_DATE_DESC, POPULARITY_DESC], isAdult: false) {
          ${MEDIA_CARD_FRAGMENT}
        }
      }
    }
  `;

  const [batchAResult, batchBResult] = await Promise.all([
    queryAniListWithMeta<any>(batchAQuery, {}, 'anilist:discovery:batchA', 1200),
    queryAniListWithMeta<any>(
      batchBQuery,
      { recentThreshold },
      `anilist:discovery:batchB:${nowYear}`,
      1200
    ),
  ]);

  const dataA = batchAResult.data || {};
  const dataB = batchBResult.data || {};

  const categories: HomeDiscoveryCategory[] = [
    {
      key: 'topRated',
      title: 'Top Rated',
      subtitle: 'Highest-scored anime across the catalog',
      exploreQuery: '/explore?sort=SCORE_DESC',
      items: (dataA.topRated?.media || []).map(mapAnimeSummary),
    },
    {
      key: 'mostWatched',
      title: 'Most Watched',
      subtitle: 'All-time viewer favorites worldwide',
      exploreQuery: '/explore?sort=POPULARITY_DESC',
      items: (dataA.mostWatched?.media || []).map(mapAnimeSummary),
    },
    {
      key: 'hiddenGems',
      title: 'Hidden Gems',
      subtitle: 'Critically acclaimed titles off the beaten path',
      exploreQuery: '/explore?sort=SCORE_DESC&page=2',
      items: (dataA.hiddenGems?.media || []).map(mapAnimeSummary),
    },
    {
      key: 'bestRomance',
      title: 'Best Romance',
      subtitle: 'Top-rated love stories and romantic dramas',
      exploreQuery: '/explore?genre=Romance&sort=SCORE_DESC',
      items: (dataA.bestRomance?.media || []).map(mapAnimeSummary),
    },
    {
      key: 'bestAction',
      title: 'Best Action',
      subtitle: 'High-stakes battles and kinetic animation',
      exploreQuery: '/explore?genre=Action&sort=SCORE_DESC',
      items: (dataA.bestAction?.media || []).map(mapAnimeSummary),
    },
    {
      key: 'fantasyIsekai',
      title: 'Fantasy & Isekai',
      subtitle: 'Otherworldly realms, magic systems, and epics',
      exploreQuery: '/explore?genre=Fantasy&sort=POPULARITY_DESC',
      items: (dataA.fantasyIsekai?.media || []).map(mapAnimeSummary),
    },
    {
      key: 'mysteryThriller',
      title: 'Mystery & Thriller',
      subtitle: 'Mind games, investigations, and suspense',
      exploreQuery: '/explore?genre=Mystery&sort=SCORE_DESC',
      items: (dataB.mysteryThriller?.media || []).map(mapAnimeSummary),
    },
    {
      key: 'comedySliceOfLife',
      title: 'Comedy & Slice of Life',
      subtitle: 'Warm everyday stories and sharp humor',
      exploreQuery: '/explore?genre=Comedy&sort=SCORE_DESC',
      items: (dataB.comedySliceOfLife?.media || []).map(mapAnimeSummary),
    },
    {
      key: 'sciFiSupernatural',
      title: 'Sci-Fi & Supernatural',
      subtitle: 'Futuristic worlds and paranormal phenomena',
      exploreQuery: '/explore?genre=Sci-Fi&sort=SCORE_DESC',
      items: (dataB.sciFiSupernatural?.media || []).map(mapAnimeSummary),
    },
    {
      key: 'classicAnime',
      title: 'Classic Anime',
      subtitle: 'Acclaimed pre-2010 masterpieces',
      exploreQuery: '/explore?sort=SCORE_DESC',
      items: (dataB.classicAnime?.media || []).map(mapAnimeSummary),
    },
    {
      key: 'newReleases',
      title: 'New Releases',
      subtitle: 'Recent broadcast premieres and completed runs',
      exploreQuery: '/explore?sort=START_DATE_DESC',
      items: (dataB.newReleases?.media || []).map(mapAnimeSummary),
    },
  ];

  const isStale = Boolean(batchAResult.meta.isStale || batchBResult.meta.isStale);
  return {
    categories,
    _meta: {
      source: isStale ? 'cache-fallback' : 'anilist',
      fetchedAt: batchAResult.meta.fetchedAt || batchBResult.meta.fetchedAt,
      isStale,
      notice: batchAResult.meta.notice || batchBResult.meta.notice || null,
    },
  };
}

export interface WatchlistMediaAiringSnapshot {
  id: number;
  slug: string;
  title: AnimeSummary['title'];
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
  startDate?: AnimeSummary['startDate'];
  endDate?: AnimeSummary['startDate'];
  coverImage?: AnimeSummary['coverImage'];
  bannerImage?: string | null;
  nextAiringEpisode?: AnimeSummary['nextAiringEpisode'];
  recentAiredEpisode: number | null;
  recentAiredAt: number | null;
}

export async function getWatchlistMediaAiringSnapshots(
  anilistIds: number[],
  bypassCache = false
): Promise<Map<number, WatchlistMediaAiringSnapshot>> {
  const cleanIds = Array.from(
    new Set(anilistIds.filter((id) => Number.isInteger(id) && id > 0))
  ).sort((a, b) => a - b);

  const snapshots = new Map<number, WatchlistMediaAiringSnapshot>();
  if (cleanIds.length === 0) return snapshots;

  const nowUnix = Math.floor(Date.now() / 1000);
  const lookbackUnix = nowUnix - 45 * 86400;

  const query = `
    query WatchlistEpisodeCheck($ids: [Int], $lookback: Int, $now: Int) {
      mediaPage: Page(page: 1, perPage: 50) {
        media(id_in: $ids, type: ANIME, isAdult: false) {
          id
          title {
            romaji
            english
            native
            userPreferred
          }
          format
          status
          episodes
          startDate { year month day }
          endDate { year month day }
          coverImage {
            extraLarge
            large
            medium
            color
          }
          bannerImage
          nextAiringEpisode {
            id
            episode
            airingAt
            timeUntilAiring
          }
        }
      }
      recentSchedules: Page(page: 1, perPage: 50) {
        airingSchedules(
          mediaId_in: $ids,
          airingAt_greater: $lookback,
          airingAt_lesser: $now,
          sort: TIME_DESC
        ) {
          id
          mediaId
          episode
          airingAt
          timeUntilAiring
        }
      }
    }
  `;

  for (let i = 0; i < cleanIds.length; i += 50) {
    const chunk = cleanIds.slice(i, i + 50);
    const cacheKey = `anilist:watchlist-airing:${chunk.join(',')}`;
    const { data } = await queryAniListWithMeta<any>(
      query,
      { ids: chunk, lookback: lookbackUnix, now: nowUnix },
      cacheKey,
      180,
      bypassCache
    );

    const latestScheduleByMedia = new Map<number, { episode: number; airingAt: number }>();
    for (const sched of data?.recentSchedules?.airingSchedules || []) {
      if (!sched?.mediaId || !Number.isFinite(sched.episode) || !Number.isFinite(sched.airingAt)) {
        continue;
      }
      const existing = latestScheduleByMedia.get(sched.mediaId);
      if (!existing || sched.episode > existing.episode) {
        latestScheduleByMedia.set(sched.mediaId, {
          episode: Number(sched.episode),
          airingAt: Number(sched.airingAt),
        });
      }
    }

    for (const media of data?.mediaPage?.media || []) {
      if (!media?.id) continue;
      const sched = latestScheduleByMedia.get(media.id);
      snapshots.set(media.id, {
        id: media.id,
        slug: buildAnimeSlug(media.id, media.title),
        title: media.title,
        format: media.format ?? null,
        status: media.status ?? null,
        episodes: typeof media.episodes === 'number' ? media.episodes : null,
        startDate: media.startDate ?? null,
        endDate: media.endDate ?? null,
        coverImage: media.coverImage ?? undefined,
        bannerImage: media.bannerImage ?? null,
        nextAiringEpisode: media.nextAiringEpisode ?? null,
        recentAiredEpisode: sched?.episode ?? null,
        recentAiredAt: sched?.airingAt ?? null,
      });
    }
  }

  return snapshots;
}



