import type { AiringScheduleItem, DataProvenanceMeta } from '../types/anime.ts';
import { apiFetch } from './apiClient.ts';

export interface AiringScheduleResponse {
  pageInfo: any;
  schedules: AiringScheduleItem[];
  _meta?: DataProvenanceMeta;
}

export const airingScheduleService = {
  async getSchedule(
    params?: { start?: number; end?: number; page?: number; perPage?: number },
    signal?: AbortSignal
  ): Promise<AiringScheduleResponse> {
    const qs = new URLSearchParams();
    if (params?.start) qs.set('start', String(params.start));
    if (params?.end) qs.set('end', String(params.end));
    if (params?.page) qs.set('page', String(params.page));
    if (params?.perPage) qs.set('perPage', String(params.perPage));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiFetch<AiringScheduleResponse>(`/api/anime/schedule${suffix}`, { signal });
  },
};
