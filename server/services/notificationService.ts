import type {
  AnimeDate,
  WatchHistoryItem,
  WatchlistEpisodeNotification,
  WatchlistItem,
  WatchlistNotificationPreferences,
  WatchlistNotificationsResponse,
  WatchlistNotificationStateRecord,
  WatchStatus,
} from '../../src/types/anime.ts';
import { getPrimaryTitle } from '../../src/utils/slug.ts';
import {
  getWatchlistMediaAiringSnapshots,
  type WatchlistMediaAiringSnapshot,
} from './anilistService.ts';
import { dbGet, dbList, dbSet } from './db.ts';

const MAX_STORED_IDS = 500;
const RECENT_FINISH_WINDOW_SEC = 30 * 86400;

export function getDefaultNotificationState(userId: string): WatchlistNotificationStateRecord {
  const now = new Date().toISOString();
  return {
    id: userId,
    userId,
    readIds: [],
    dismissedIds: [],
    includePlanToWatch: true,
    includeOnHold: false,
    lastCheckedAt: now,
    updatedAt: now,
  };
}

function sanitizeIdList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const unique = new Set<string>();
  for (const item of input) {
    if (typeof item === 'string' && item.trim() && item.length <= 128) {
      unique.add(item.trim());
    }
  }
  const arr = Array.from(unique);
  return arr.length > MAX_STORED_IDS ? arr.slice(arr.length - MAX_STORED_IDS) : arr;
}

export async function getUserNotificationState(
  userId: string
): Promise<WatchlistNotificationStateRecord> {
  const saved = await dbGet<WatchlistNotificationStateRecord>('user_notification_states', userId);
  const def = getDefaultNotificationState(userId);
  if (!saved) return def;
  return {
    ...def,
    ...saved,
    id: userId,
    userId,
    readIds: sanitizeIdList(saved.readIds),
    dismissedIds: sanitizeIdList(saved.dismissedIds),
    includePlanToWatch:
      saved.includePlanToWatch !== undefined ? Boolean(saved.includePlanToWatch) : true,
    includeOnHold: saved.includeOnHold !== undefined ? Boolean(saved.includeOnHold) : false,
  };
}

function fuzzyDateToUnixEndOfDay(date?: AnimeDate | null): number | null {
  if (!date?.year) return null;
  const month = date.month && date.month >= 1 && date.month <= 12 ? date.month : 12;
  const day = date.day && date.day >= 1 && date.day <= 31 ? date.day : 28;
  const ms = Date.UTC(date.year, month - 1, day, 23, 59, 59);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

export function getMonitoredStatuses(
  prefs: WatchlistNotificationPreferences
): Set<WatchStatus> {
  const statuses = new Set<WatchStatus>(['WATCHING']);
  if (prefs.includePlanToWatch) statuses.add('PLAN_TO_WATCH');
  if (prefs.includeOnHold) statuses.add('ON_HOLD');
  return statuses;
}

export function evaluateWatchlistEpisodeNotifications(params: {
  watchlist: WatchlistItem[];
  watchHistory: WatchHistoryItem[];
  mediaSnapshots: Map<number, WatchlistMediaAiringSnapshot>;
  state: WatchlistNotificationStateRecord;
  nowSec?: number;
}): {
  notifications: WatchlistEpisodeNotification[];
  unreadCount: number;
  monitoredCount: number;
} {
  const nowSec = params.nowSec ?? Math.floor(Date.now() / 1000);
  const monitoredStatuses = getMonitoredStatuses({
    includePlanToWatch: params.state.includePlanToWatch,
    includeOnHold: params.state.includeOnHold,
  });

  const monitoredEntries = params.watchlist.filter((entry) =>
    monitoredStatuses.has(entry.status)
  );

  // Track highest episode number reached in watch_history per anime
  const historyMaxByAnime = new Map<number, number>();
  for (const h of params.watchHistory) {
    if (!Number.isInteger(h.anilistId) || !Number.isFinite(h.episodeNumber)) continue;
    const prev = historyMaxByAnime.get(h.anilistId) || 0;
    if (h.episodeNumber > prev) {
      historyMaxByAnime.set(h.anilistId, Math.floor(h.episodeNumber));
    }
  }

  const readSet = new Set(params.state.readIds);
  const dismissedSet = new Set(params.state.dismissedIds);
  const notifications: WatchlistEpisodeNotification[] = [];

  for (const entry of monitoredEntries) {
    const snap = params.mediaSnapshots.get(entry.anilistId);
    if (!snap || snap.status === 'NOT_YET_RELEASED' || snap.status === 'CANCELLED') {
      continue;
    }

    const effectiveWatched = Math.max(
      0,
      Math.floor(entry.episodesWatched || 0),
      historyMaxByAnime.get(entry.anilistId) || 0
    );

    const scheduleLatestEp =
      snap.recentAiredEpisode && snap.recentAiredEpisode > 0 ? snap.recentAiredEpisode : 0;
    const scheduleAiredAt =
      snap.recentAiredAt && snap.recentAiredAt <= nowSec ? snap.recentAiredAt : null;

    let nextDerivedEp = 0;
    let nextDerivedAiredAt: number | null = null;
    if (snap.nextAiringEpisode && Number.isFinite(snap.nextAiringEpisode.episode)) {
      if (snap.nextAiringEpisode.airingAt <= nowSec) {
        nextDerivedEp = Math.floor(snap.nextAiringEpisode.episode);
        nextDerivedAiredAt = snap.nextAiringEpisode.airingAt;
      } else if (snap.nextAiringEpisode.episode > 1) {
        nextDerivedEp = Math.floor(snap.nextAiringEpisode.episode) - 1;
      }
    }

    let latestAiredEpisode = 0;
    let airedAt: number | null = scheduleAiredAt;

    if (snap.status === 'FINISHED') {
      const totalEp = snap.episodes && snap.episodes > 0 ? Math.floor(snap.episodes) : 0;
      latestAiredEpisode = Math.max(totalEp, scheduleLatestEp, nextDerivedEp);

      const entryCreatedMs = Date.parse(entry.createdAt || entry.updatedAt || '');
      const entryCreatedSec = Number.isFinite(entryCreatedMs)
        ? Math.floor(entryCreatedMs / 1000)
        : nowSec;
      const endDateSec = fuzzyDateToUnixEndOfDay(snap.endDate);

      // Avoid generating "new episode" alerts for old already-finished catalog series
      // unless an episode aired recently or after the user added the show to their watchlist.
      const finishedRecently =
        (scheduleAiredAt !== null &&
          (nowSec - scheduleAiredAt <= RECENT_FINISH_WINDOW_SEC ||
            scheduleAiredAt >= entryCreatedSec)) ||
        (endDateSec !== null &&
          (nowSec - endDateSec <= RECENT_FINISH_WINDOW_SEC || endDateSec >= entryCreatedSec));

      if (!finishedRecently) {
        continue;
      }
    } else {
      // RELEASING or HIATUS
      latestAiredEpisode = Math.max(scheduleLatestEp, nextDerivedEp);
      if (airedAt === null && nextDerivedAiredAt !== null) {
        airedAt = nextDerivedAiredAt;
      }
    }

    if (latestAiredEpisode <= 0 || latestAiredEpisode <= effectiveWatched) {
      continue;
    }

    const notifId = `${entry.anilistId}_ep_${latestAiredEpisode}`;
    if (dismissedSet.has(notifId)) {
      continue;
    }

    const nextUnwatchedEpisode = Math.min(
      latestAiredEpisode,
      Math.max(1, effectiveWatched + 1)
    );
    const newEpisodesCount = Math.max(1, latestAiredEpisode - effectiveWatched);

    notifications.push({
      id: notifId,
      anilistId: entry.anilistId,
      animeTitle: entry.animeTitle || getPrimaryTitle(snap.title),
      animeSlug: entry.animeSlug || snap.slug || String(entry.anilistId),
      coverImage: entry.coverImage || snap.coverImage?.large || snap.coverImage?.extraLarge || null,
      bannerImage: snap.bannerImage || null,
      format: snap.format ?? null,
      mediaStatus: snap.status ?? null,
      watchStatus: entry.status,
      latestAiredEpisode,
      nextUnwatchedEpisode,
      newEpisodesCount,
      episodesWatched: effectiveWatched,
      totalEpisodes: snap.episodes ?? entry.totalEpisodes ?? null,
      airedAt,
      nextAiringEpisode: snap.nextAiringEpisode ?? null,
      isRead: readSet.has(notifId),
    });
  }

  // Sort unread first, then most recently aired (falling back to latest episode count / anilistId)
  notifications.sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
    const aTime = a.airedAt ?? 0;
    const bTime = b.airedAt ?? 0;
    if (aTime !== bTime) return bTime - aTime;
    return b.latestAiredEpisode - a.latestAiredEpisode;
  });

  const unreadCount = notifications.reduce((acc, n) => acc + (n.isRead ? 0 : 1), 0);

  return {
    notifications,
    unreadCount,
    monitoredCount: monitoredEntries.length,
  };
}

export async function getUserWatchlistNotifications(
  userId: string,
  options: { bypassCache?: boolean } = {}
): Promise<WatchlistNotificationsResponse> {
  const [watchlist, watchHistory, state] = await Promise.all([
    dbList<WatchlistItem>('watchlists', (w) => w.userId === userId),
    dbList<WatchHistoryItem>('watch_history', (h) => h.userId === userId),
    getUserNotificationState(userId),
  ]);

  const monitoredStatuses = getMonitoredStatuses({
    includePlanToWatch: state.includePlanToWatch,
    includeOnHold: state.includeOnHold,
  });
  const monitoredIds = watchlist
    .filter((w) => monitoredStatuses.has(w.status))
    .map((w) => w.anilistId);

  const mediaSnapshots =
    monitoredIds.length > 0
      ? await getWatchlistMediaAiringSnapshots(monitoredIds, Boolean(options.bypassCache))
      : new Map<number, WatchlistMediaAiringSnapshot>();

  const evaluated = evaluateWatchlistEpisodeNotifications({
    watchlist,
    watchHistory,
    mediaSnapshots,
    state,
  });

  const checkedAt = new Date().toISOString();
  return {
    notifications: evaluated.notifications,
    unreadCount: evaluated.unreadCount,
    monitoredCount: evaluated.monitoredCount,
    preferences: {
      includePlanToWatch: state.includePlanToWatch,
      includeOnHold: state.includeOnHold,
    },
    checkedAt,
  };
}

export async function markUserNotificationsRead(
  userId: string,
  idsToMark: string[]
): Promise<WatchlistNotificationStateRecord> {
  const state = await getUserNotificationState(userId);
  const nextRead = sanitizeIdList([...state.readIds, ...idsToMark]);
  const updated: WatchlistNotificationStateRecord = {
    ...state,
    readIds: nextRead,
    updatedAt: new Date().toISOString(),
  };
  await dbSet('user_notification_states', userId, updated);
  return updated;
}

export async function dismissUserNotifications(
  userId: string,
  idsToDismiss: string[]
): Promise<WatchlistNotificationStateRecord> {
  const state = await getUserNotificationState(userId);
  const nextDismissed = sanitizeIdList([...state.dismissedIds, ...idsToDismiss]);
  const nextRead = sanitizeIdList([...state.readIds, ...idsToDismiss]);
  const updated: WatchlistNotificationStateRecord = {
    ...state,
    readIds: nextRead,
    dismissedIds: nextDismissed,
    updatedAt: new Date().toISOString(),
  };
  await dbSet('user_notification_states', userId, updated);
  return updated;
}

export async function updateUserNotificationPreferences(
  userId: string,
  patch: Partial<WatchlistNotificationPreferences>
): Promise<WatchlistNotificationStateRecord> {
  const state = await getUserNotificationState(userId);
  const updated: WatchlistNotificationStateRecord = {
    ...state,
    includePlanToWatch:
      patch.includePlanToWatch !== undefined
        ? Boolean(patch.includePlanToWatch)
        : state.includePlanToWatch,
    includeOnHold:
      patch.includeOnHold !== undefined ? Boolean(patch.includeOnHold) : state.includeOnHold,
    updatedAt: new Date().toISOString(),
  };
  await dbSet('user_notification_states', userId, updated);
  return updated;
}
