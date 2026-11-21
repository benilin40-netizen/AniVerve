import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dismissUserNotifications,
  evaluateWatchlistEpisodeNotifications,
  getDefaultNotificationState,
  getUserNotificationState,
  markUserNotificationsRead,
  updateUserNotificationPreferences,
} from '../services/notificationService.ts';
import type { WatchlistMediaAiringSnapshot } from '../services/anilistService.ts';
import { dbDelete } from '../services/db.ts';
import type { WatchHistoryItem, WatchlistItem } from '../../src/types/anime.ts';

function makeWatchlistEntry(overrides: Partial<WatchlistItem>): WatchlistItem {
  const now = new Date().toISOString();
  return {
    id: `u_${overrides.anilistId || 1}`,
    userId: overrides.userId || 'u1',
    anilistId: overrides.anilistId || 1,
    animeTitle: overrides.animeTitle || 'Test Anime',
    animeSlug: overrides.animeSlug || '1-test-anime',
    coverImage: null,
    totalEpisodes: overrides.totalEpisodes ?? 12,
    status: overrides.status || 'WATCHING',
    episodesWatched: overrides.episodesWatched ?? 0,
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
  };
}

function makeSnapshot(
  id: number,
  overrides: Partial<WatchlistMediaAiringSnapshot>
): WatchlistMediaAiringSnapshot {
  return {
    id,
    slug: `${id}-test-anime`,
    title: { romaji: `Anime ${id}`, english: `Anime ${id}` },
    format: 'TV',
    status: 'RELEASING',
    episodes: 12,
    startDate: { year: 2026, month: 10, day: 1 },
    endDate: null,
    coverImage: { large: 'https://example.com/cover.jpg' },
    bannerImage: null,
    nextAiringEpisode: null,
    recentAiredEpisode: null,
    recentAiredAt: null,
    ...overrides,
  };
}

test('evaluateWatchlistEpisodeNotifications detects new aired episodes and excludes caught-up or old finished shows', () => {
  const nowSec = 1_795_000_000;
  const watchlist: WatchlistItem[] = [
    // 1. Releasing show where Ep 6 aired 2h ago and user watched Ep 4
    makeWatchlistEntry({
      anilistId: 101,
      animeTitle: 'Airing Adventure',
      status: 'WATCHING',
      episodesWatched: 4,
    }),
    // 2. Releasing show where Ep 3 aired 1d ago and user already reached Ep 3 in history
    makeWatchlistEntry({
      anilistId: 102,
      animeTitle: 'Caught Up Show',
      status: 'WATCHING',
      episodesWatched: 2,
    }),
    // 3. Old finished show from 2015 in PLAN_TO_WATCH -> should NOT produce false alert
    makeWatchlistEntry({
      anilistId: 103,
      animeTitle: 'Classic Finished Show',
      status: 'PLAN_TO_WATCH',
      episodesWatched: 0,
      createdAt: new Date((nowSec - 86400) * 1000).toISOString(),
    }),
    // 4. Dropped show -> excluded
    makeWatchlistEntry({
      anilistId: 104,
      animeTitle: 'Dropped Show',
      status: 'DROPPED',
      episodesWatched: 1,
    }),
    // 5. Upcoming show not yet released -> excluded
    makeWatchlistEntry({
      anilistId: 105,
      animeTitle: 'Upcoming Show',
      status: 'PLAN_TO_WATCH',
      episodesWatched: 0,
    }),
    // 6. Recently finished show where Ep 12 aired 3 days ago and user watched Ep 10 -> included
    makeWatchlistEntry({
      anilistId: 106,
      animeTitle: 'Just Finished Show',
      status: 'WATCHING',
      episodesWatched: 10,
      createdAt: new Date((nowSec - 20 * 86400) * 1000).toISOString(),
    }),
    // 7. Releasing show on hiatus (only nextAiringEpisode known) -> derives Ep 11 from next Ep 12
    makeWatchlistEntry({
      anilistId: 107,
      animeTitle: 'Hiatus Derived Show',
      status: 'PLAN_TO_WATCH',
      episodesWatched: 0,
    }),
    // 8. On Hold show -> excluded by default unless includeOnHold is true
    makeWatchlistEntry({
      anilistId: 108,
      animeTitle: 'On Hold Show',
      status: 'ON_HOLD',
      episodesWatched: 2,
    }),
  ];

  const watchHistory: WatchHistoryItem[] = [
    {
      id: 'u1_102_3',
      userId: 'u1',
      anilistId: 102,
      animeTitle: 'Caught Up Show',
      animeSlug: '102-caught-up',
      episodeNumber: 3,
      providerKey: 'yenime',
      language: 'sub',
      progressSec: 120,
      durationSec: 1400,
      completed: false,
      watchedAt: new Date(nowSec * 1000).toISOString(),
    },
  ];

  const snapshots = new Map<number, WatchlistMediaAiringSnapshot>([
    [
      101,
      makeSnapshot(101, {
        status: 'RELEASING',
        recentAiredEpisode: 6,
        recentAiredAt: nowSec - 7200,
        nextAiringEpisode: { episode: 7, airingAt: nowSec + 597600, timeUntilAiring: 597600 },
      }),
    ],
    [
      102,
      makeSnapshot(102, {
        status: 'RELEASING',
        recentAiredEpisode: 3,
        recentAiredAt: nowSec - 86400,
        nextAiringEpisode: { episode: 4, airingAt: nowSec + 500000, timeUntilAiring: 500000 },
      }),
    ],
    [
      103,
      makeSnapshot(103, {
        status: 'FINISHED',
        episodes: 24,
        startDate: { year: 2015, month: 4, day: 1 },
        endDate: { year: 2015, month: 9, day: 25 },
      }),
    ],
    [
      104,
      makeSnapshot(104, {
        status: 'RELEASING',
        recentAiredEpisode: 8,
        recentAiredAt: nowSec - 3600,
      }),
    ],
    [
      105,
      makeSnapshot(105, {
        status: 'NOT_YET_RELEASED',
        episodes: 12,
      }),
    ],
    [
      106,
      makeSnapshot(106, {
        status: 'FINISHED',
        episodes: 12,
        recentAiredEpisode: 12,
        recentAiredAt: nowSec - 3 * 86400,
        endDate: { year: 2026, month: 11, day: 15 },
      }),
    ],
    [
      107,
      makeSnapshot(107, {
        status: 'RELEASING',
        nextAiringEpisode: { episode: 12, airingAt: nowSec + 864000, timeUntilAiring: 864000 },
      }),
    ],
    [
      108,
      makeSnapshot(108, {
        status: 'RELEASING',
        recentAiredEpisode: 5,
        recentAiredAt: nowSec - 1800,
      }),
    ],
  ]);

  const state = getDefaultNotificationState('u1');
  const result = evaluateWatchlistEpisodeNotifications({
    watchlist,
    watchHistory,
    mediaSnapshots: snapshots,
    state,
    nowSec,
  });

  assert.equal(result.monitoredCount, 6); // 101, 102, 103, 105, 106, 107
  assert.equal(result.unreadCount, 3);
  assert.deepEqual(
    result.notifications.map((n) => n.id),
    ['101_ep_6', '106_ep_12', '107_ep_11']
  );

  const ep101 = result.notifications[0];
  assert.equal(ep101.nextUnwatchedEpisode, 5);
  assert.equal(ep101.newEpisodesCount, 2);
  assert.equal(ep101.isRead, false);

  // Marking 101_ep_6 as read keeps it in list as read and decrements unreadCount
  const readResult = evaluateWatchlistEpisodeNotifications({
    watchlist,
    watchHistory,
    mediaSnapshots: snapshots,
    state: { ...state, readIds: ['101_ep_6'] },
    nowSec,
  });
  assert.equal(readResult.unreadCount, 2);
  assert.equal(readResult.notifications.find((n) => n.id === '101_ep_6')?.isRead, true);
  // Read notification sorts after unread notifications
  assert.equal(readResult.notifications[2].id, '101_ep_6');

  // Dismissing 106_ep_12 hides it while keeping other episodes
  const dismissedResult = evaluateWatchlistEpisodeNotifications({
    watchlist,
    watchHistory,
    mediaSnapshots: snapshots,
    state: { ...state, dismissedIds: ['106_ep_12'] },
    nowSec,
  });
  assert.deepEqual(
    dismissedResult.notifications.map((n) => n.id),
    ['101_ep_6', '107_ep_11']
  );

  // Enabling includeOnHold and disabling includePlanToWatch swaps monitored shows accurately
  const onHoldResult = evaluateWatchlistEpisodeNotifications({
    watchlist,
    watchHistory,
    mediaSnapshots: snapshots,
    state: { ...state, includePlanToWatch: false, includeOnHold: true },
    nowSec,
  });
  assert.deepEqual(
    onHoldResult.notifications.map((n) => n.id),
    ['108_ep_5', '101_ep_6', '106_ep_12']
  );
});

test('notification read, dismiss, and preferences persist cleanly in user_notification_states', async () => {
  const testUserId = 'test_notif_user_persistence';
  try {
    await dbDelete('user_notification_states', testUserId);

    const initial = await getUserNotificationState(testUserId);
    assert.equal(initial.includePlanToWatch, true);
    assert.equal(initial.includeOnHold, false);
    assert.deepEqual(initial.readIds, []);

    const afterRead = await markUserNotificationsRead(testUserId, ['101_ep_6']);
    assert.deepEqual(afterRead.readIds, ['101_ep_6']);

    const afterDismiss = await dismissUserNotifications(testUserId, ['106_ep_12']);
    assert.ok(afterDismiss.dismissedIds.includes('106_ep_12'));
    assert.ok(afterDismiss.readIds.includes('106_ep_12'));

    const afterPrefs = await updateUserNotificationPreferences(testUserId, {
      includePlanToWatch: false,
      includeOnHold: true,
    });
    assert.equal(afterPrefs.includePlanToWatch, false);
    assert.equal(afterPrefs.includeOnHold, true);

    const reloaded = await getUserNotificationState(testUserId);
    assert.equal(reloaded.includePlanToWatch, false);
    assert.equal(reloaded.includeOnHold, true);
    assert.deepEqual(reloaded.readIds, ['101_ep_6', '106_ep_12']);
    assert.deepEqual(reloaded.dismissedIds, ['106_ep_12']);
  } finally {
    await dbDelete('user_notification_states', testUserId);
  }
});
