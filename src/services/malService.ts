import type { MalAnimeInfo } from '../types/anime.ts';
import { apiFetch } from './apiClient.ts';

export const malService = {
  async getByAnimeId(anilistId: number, signal?: AbortSignal): Promise<MalAnimeInfo | null> {
    try {
      const res = await apiFetch<{ malInfo: MalAnimeInfo | null }>(`/api/anime/${anilistId}`, {
        signal,
      });
      return res.malInfo || null;
    } catch {
      return null;
    }
  },
};
