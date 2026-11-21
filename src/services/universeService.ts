import type {
  AnimeCharacterSpotlight,
  AnimeOfTheDayPayload,
  AnimeSummary,
  CuratedCollection,
  FaceOffMatchup,
  HomepageUniverseConfig,
  PremiereReminder,
  UniversalSearchResult,
  UniversePreferences,
  UserCollection,
} from '../types/anime.ts';
import { apiFetch } from './apiClient.ts';

export const universeService = {
  async getAnimeOfTheDay(signal?: AbortSignal): Promise<AnimeOfTheDayPayload> {
    const tz =
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        : 'UTC';
    return apiFetch<AnimeOfTheDayPayload>(
      `/api/anime/spotlight?tz=${encodeURIComponent(tz)}`,
      { signal }
    );
  },

  async getSurpriseAnime(excludeGenres: string[] = []): Promise<AnimeSummary> {
    const qs = excludeGenres.length
      ? `?excludeGenres=${encodeURIComponent(excludeGenres.join(','))}`
      : '';
    const res = await apiFetch<{ anime: AnimeSummary }>(`/api/anime/surprise${qs}`);
    return res.anime;
  },

  async getHomepageConfig(signal?: AbortSignal): Promise<HomepageUniverseConfig> {
    const res = await apiFetch<{ config: HomepageUniverseConfig }>('/api/anime/universe-config', {
      signal,
    });
    return res.config;
  },

  async getOfficialCollections(signal?: AbortSignal): Promise<CuratedCollection[]> {
    const res = await apiFetch<{ collections: CuratedCollection[] }>('/api/anime/collections', {
      signal,
    });
    return res.collections || [];
  },

  async getCharacterSpotlights(page = 1, perPage = 10, signal?: AbortSignal) {
    const res = await apiFetch<{ characters: AnimeCharacterSpotlight[] }>(
      `/api/anime/characters?page=${page}&perPage=${perPage}`,
      { signal }
    );
    return res.characters || [];
  },

  async getActiveFaceOff(signal?: AbortSignal): Promise<FaceOffMatchup> {
    const res = await apiFetch<{ matchup: FaceOffMatchup }>('/api/anime/faceoff', { signal });
    return res.matchup;
  },

  async voteFaceOff(matchupId: string, winnerAnilistId: number): Promise<FaceOffMatchup> {
    const res = await apiFetch<{ matchup: FaceOffMatchup }>('/api/user/faceoff-vote', {
      method: 'POST',
      body: JSON.stringify({ matchupId, winnerAnilistId }),
    });
    return res.matchup;
  },

  async universalSearch(query: string, signal?: AbortSignal): Promise<UniversalSearchResult> {
    return apiFetch<UniversalSearchResult>(
      `/api/anime/universal-search?q=${encodeURIComponent(query)}`,
      { signal }
    );
  },

  async getReminders(): Promise<PremiereReminder[]> {
    const res = await apiFetch<{ reminders: PremiereReminder[] }>('/api/user/reminders');
    return res.reminders || [];
  },

  async saveReminder(input: {
    anilistId: number;
    animeTitle: string;
    animeSlug: string;
    coverImage?: string | null;
    airingAt?: number | null;
    episode?: number | null;
  }): Promise<PremiereReminder> {
    const res = await apiFetch<{ reminder: PremiereReminder }>('/api/user/reminders', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.reminder;
  },

  async removeReminder(anilistId: number): Promise<void> {
    await apiFetch(`/api/user/reminders/${anilistId}`, { method: 'DELETE' });
  },

  async getUserCollections(): Promise<UserCollection[]> {
    const res = await apiFetch<{ collections: UserCollection[] }>('/api/user/collections');
    return res.collections || [];
  },

  async createUserCollection(input: {
    title: string;
    description?: string;
    anilistIds?: number[];
    isPrivate?: boolean;
  }): Promise<UserCollection> {
    const res = await apiFetch<{ collection: UserCollection }>('/api/user/collections', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.collection;
  },

  async updateUserCollection(
    id: string,
    patch: Partial<{
      title: string;
      description: string;
      anilistIds: number[];
      addAnilistId: number;
      removeAnilistId: number;
      isPrivate: boolean;
    }>
  ): Promise<UserCollection> {
    const res = await apiFetch<{ collection: UserCollection }>(
      `/api/user/collections/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    );
    return res.collection;
  },

  async deleteUserCollection(id: string): Promise<void> {
    await apiFetch(`/api/user/collections/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async getUserPreferences(): Promise<UniversePreferences> {
    const res = await apiFetch<{ preferences: UniversePreferences }>('/api/user/preferences');
    return res.preferences;
  },

  async updateUserPreferences(patch: Partial<UniversePreferences>): Promise<UniversePreferences> {
    const res = await apiFetch<{ preferences: UniversePreferences }>('/api/user/preferences', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return res.preferences;
  },

  async getUserUniverseSummary() {
    return apiFetch<{
      stats: {
        watchlistCount: number;
        watchingCount: number;
        completedCount: number;
        favoritesCount: number;
        episodesLogged: number;
        uniqueAnimeWatched: number;
        hoursWatched: number;
        ratingsCount: number;
        averageRating: number | null;
        remindersCount: number;
        collectionsCount: number;
      };
      favoriteGenres: Array<{ genre: string; count: number }>;
      achievements: Array<{
        id: string;
        title: string;
        description: string;
        unlocked: boolean;
        progress: number;
        target: number;
        category: string;
      }>;
      personalizedRecommendations: AnimeSummary[];
    }>('/api/user/universe-summary');
  },
};
