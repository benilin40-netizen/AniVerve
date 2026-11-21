import type {
  AnimeDetail,
  AnimeIdMapping,
  AnimeSummary,
  DataProvenanceMeta,
  EpisodeDiscoveryResult,
  EpisodeSourcesResponse,
  HomeDiscoveryCategory,
  MalAnimeInfo,
  MalFetchMeta,
  SystemSettings,
} from '../types/anime.ts';
import { API_TIMEOUTS, apiFetch } from './apiClient.ts';

export interface HomeCollectionsResponse {
  season: string;
  seasonYear: number;
  featured: AnimeSummary[];
  trending: AnimeSummary[];
  popular: AnimeSummary[];
  topRated: AnimeSummary[];
  seasonal: AnimeSummary[];
  upcoming: AnimeSummary[];
  airing: AnimeSummary[];
  recentlyUpdated?: AnimeSummary[];
  recommended?: AnimeSummary[];
  movies: AnimeSummary[];
  _meta?: DataProvenanceMeta;
}

export interface ExploreResponse {
  pageInfo: {
    total: number;
    currentPage: number;
    lastPage: number;
    hasNextPage: boolean;
    perPage: number;
  };
  media: AnimeSummary[];
  _meta?: DataProvenanceMeta;
}

export interface AnimeDetailsResponse {
  anime: AnimeDetail;
  _meta?: DataProvenanceMeta;
  malInfo: MalAnimeInfo | null;
  malMeta?: MalFetchMeta;
}

export interface ExploreFilters {
  search?: string;
  genre?: string;
  tag?: string;
  year?: string | number;
  season?: string;
  format?: string;
  status?: string;
  sort?: string;
  page?: number;
  perPage?: number;
}

export interface DiscoveryCategoriesResponse {
  categories: HomeDiscoveryCategory[];
  _meta?: DataProvenanceMeta;
}

export const anilistService = {
  async getHomeCollections(signal?: AbortSignal): Promise<HomeCollectionsResponse> {
    return apiFetch<HomeCollectionsResponse>('/api/anime/home', {
      signal,
      timeoutMs: API_TIMEOUTS.CATALOG_MS,
    });
  },

  async getDiscoveryCategories(signal?: AbortSignal): Promise<DiscoveryCategoriesResponse> {
    return apiFetch<DiscoveryCategoriesResponse>('/api/anime/discovery-categories', {
      signal,
      timeoutMs: API_TIMEOUTS.CATALOG_MS,
    });
  },

  async explore(filters: ExploreFilters, signal?: AbortSignal): Promise<ExploreResponse> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== 'ALL') {
        params.set(k, String(v));
      }
    });
    return apiFetch<ExploreResponse>(`/api/anime/explore?${params.toString()}`, {
      signal,
      timeoutMs: API_TIMEOUTS.CATALOG_MS,
    });
  },

  async quickSearch(query: string, signal?: AbortSignal): Promise<AnimeSummary[]> {
    if (!query.trim()) return [];
    const data = await apiFetch<{ results: AnimeSummary[] }>(
      `/api/anime/search?q=${encodeURIComponent(query.trim())}`,
      { signal, timeoutMs: API_TIMEOUTS.CATALOG_MS }
    );
    return data.results || [];
  },

  async getDetails(id: number, signal?: AbortSignal): Promise<AnimeDetailsResponse> {
    return apiFetch<AnimeDetailsResponse>(`/api/anime/${id}`, {
      signal,
      timeoutMs: API_TIMEOUTS.CATALOG_MS,
    });
  },

  async resolveIds(
    params: { anilistId?: number; malId?: number },
    signal?: AbortSignal
  ): Promise<AnimeIdMapping> {
    const qs = new URLSearchParams();
    if (params.anilistId) qs.set('anilistId', String(params.anilistId));
    if (params.malId) qs.set('malId', String(params.malId));
    const data = await apiFetch<{ mapping: AnimeIdMapping }>(
      `/api/anime/resolve-ids?${qs.toString()}`,
      {
        signal,
        timeoutMs: API_TIMEOUTS.CATALOG_MS,
      }
    );
    return data.mapping;
  },

  async getEpisodes(
    id: number,
    options?: { refresh?: boolean; signal?: AbortSignal }
  ): Promise<EpisodeDiscoveryResult> {
    const qs = options?.refresh ? '?refresh=1' : '';
    return apiFetch<EpisodeDiscoveryResult>(`/api/anime/${id}/episodes${qs}`, {
      signal: options?.signal,
      timeoutMs: API_TIMEOUTS.EPISODES_MS,
    });
  },

  async getEpisodeSources(
    id: number,
    episodeNumber: number,
    params?: {
      lang?: 'sub' | 'dub';
      provider?: string;
      autoPlay?: boolean;
      start?: number;
      refresh?: boolean;
    },
    signal?: AbortSignal
  ): Promise<EpisodeSourcesResponse> {
    const qs = new URLSearchParams({
      lang: params?.lang || 'sub',
      autoPlay: params?.autoPlay ? '1' : '0',
      start: String(Math.max(0, Math.floor(params?.start || 0))),
    });
    if (params?.provider) qs.set('provider', params.provider);
    if (params?.refresh) qs.set('refresh', '1');

    return apiFetch<EpisodeSourcesResponse>(
      `/api/anime/${id}/episode/${episodeNumber}/sources?${qs.toString()}`,
      {
        signal,
        timeoutMs: API_TIMEOUTS.STREAM_MS,
      }
    );
  },

  async getAnimeHealth(id: number, signal?: AbortSignal) {
    return apiFetch(`/api/anime/${id}/health`, {
      signal,
      timeoutMs: API_TIMEOUTS.EPISODES_MS,
    });
  },

  async getPublicSettings(): Promise<SystemSettings | null> {
    const res = await apiFetch<{ settings: SystemSettings | null }>('/api/anime/settings', {
      timeoutMs: API_TIMEOUTS.CATALOG_MS,
    });
    return res.settings;
  },
};

