import type {
  WatchlistNotificationPreferences,
  WatchlistNotificationsResponse,
} from '../types/anime.ts';
import { apiFetch } from './apiClient.ts';

export const notificationService = {
  async list(options: { refresh?: boolean; signal?: AbortSignal } = {}): Promise<WatchlistNotificationsResponse> {
    const qs = options.refresh ? '?refresh=1' : '';
    return apiFetch<WatchlistNotificationsResponse>(`/api/user/notifications${qs}`, {
      signal: options.signal,
    });
  },

  async markRead(payload: { id?: string; ids?: string[]; all?: boolean }): Promise<WatchlistNotificationsResponse> {
    return apiFetch<WatchlistNotificationsResponse>('/api/user/notifications/read', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async dismiss(payload: { id?: string; ids?: string[]; all?: boolean }): Promise<WatchlistNotificationsResponse> {
    return apiFetch<WatchlistNotificationsResponse>('/api/user/notifications/dismiss', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updatePreferences(
    patch: Partial<WatchlistNotificationPreferences>
  ): Promise<WatchlistNotificationsResponse> {
    return apiFetch<WatchlistNotificationsResponse>('/api/user/notifications/preferences', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
};
