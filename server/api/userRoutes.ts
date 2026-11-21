import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import { dbDelete, dbGet, dbList, dbSet } from '../services/db.ts';
import { getAnimeDetails } from '../services/anilistService.ts';
import {
  dismissUserNotifications,
  getUserWatchlistNotifications,
  markUserNotificationsRead,
  updateUserNotificationPreferences,
} from '../services/notificationService.ts';
import { buildUserUniverseSummary, submitFaceOffVote } from '../services/universeService.ts';
import type {
  FavoriteItem,
  PremiereReminder,
  UniversePreferences,
  UserCollection,
  UserRatingItem,
  WatchHistoryItem,
  WatchlistItem,
  WatchStatus,
} from '../../src/types/anime.ts';

const router = Router();
router.use(requireAuth);

const VALID_WATCH_STATUSES: WatchStatus[] = [
  'WATCHING',
  'COMPLETED',
  'PLAN_TO_WATCH',
  'DROPPED',
  'ON_HOLD',
];

const DEFAULT_PREFERENCES: UniversePreferences = {
  visualTheme: 'midnight-violet',
  customAccentHex: '#9B87FF',
  compactMode: false,
  reducedMotion: false,
  personalizationEnabled: true,
  profilePublic: false,
  hideAchievements: false,
};

router.get('/library', async (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const [watchlist, favorites, watchHistory, ratings] = await Promise.all([
    dbList<WatchlistItem>('watchlists', (w) => w.userId === userId),
    dbList<FavoriteItem>('favorites', (f) => f.userId === userId),
    dbList<WatchHistoryItem>('watch_history', (h) => h.userId === userId),
    dbList<UserRatingItem>('user_ratings', (r) => r.userId === userId),
  ]);

  watchlist.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  favorites.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  watchHistory.sort((a, b) => new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime());

  res.json({ watchlist, favorites, watchHistory, ratings });
});

router.post('/watchlist', async (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const { anilistId, animeTitle, animeSlug, coverImage, totalEpisodes, status, episodesWatched, notes } =
    req.body || {};

  const numId = Number(anilistId);
  if (!Number.isInteger(numId) || numId <= 0 || !animeTitle) {
    return res.status(400).json({ error: 'Valid anime ID and title are required.' });
  }

  const nextStatus: WatchStatus = VALID_WATCH_STATUSES.includes(status) ? status : 'PLAN_TO_WATCH';
  const docId = `${userId}_${numId}`;
  const existing = await dbGet<WatchlistItem>('watchlists', docId);
  const now = new Date().toISOString();

  const item: WatchlistItem = {
    id: docId,
    userId,
    anilistId: numId,
    animeTitle: String(animeTitle).slice(0, 300),
    animeSlug: String(animeSlug || `${numId}`),
    coverImage: typeof coverImage === 'string' ? coverImage : existing?.coverImage || null,
    totalEpisodes: totalEpisodes ? Number(totalEpisodes) : existing?.totalEpisodes || null,
    status: nextStatus,
    episodesWatched:
      episodesWatched !== undefined ? Math.max(0, Number(episodesWatched)) : existing?.episodesWatched || 0,
    notes: typeof notes === 'string' ? notes.slice(0, 1000) : existing?.notes || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await dbSet('watchlists', docId, item);
  res.json({ item });
});

router.delete('/watchlist/:anilistId', async (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const numId = Number(req.params.anilistId);
  if (!Number.isInteger(numId) || numId <= 0) {
    return res.status(400).json({ error: 'Invalid anime ID.' });
  }
  await dbDelete('watchlists', `${userId}_${numId}`);
  res.json({ ok: true });
});

router.post('/favorites', async (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const { anilistId, animeTitle, animeSlug, coverImage } = req.body || {};
  const numId = Number(anilistId);
  if (!Number.isInteger(numId) || numId <= 0 || !animeTitle) {
    return res.status(400).json({ error: 'Valid anime ID and title are required.' });
  }

  const docId = `${userId}_${numId}`;
  const existing = await dbGet<FavoriteItem>('favorites', docId);
  if (existing) {
    await dbDelete('favorites', docId);
    return res.json({ favorited: false });
  }

  const item: FavoriteItem = {
    id: docId,
    userId,
    anilistId: numId,
    animeTitle: String(animeTitle).slice(0, 300),
    animeSlug: String(animeSlug || `${numId}`),
    coverImage: typeof coverImage === 'string' ? coverImage : null,
    createdAt: new Date().toISOString(),
  };
  await dbSet('favorites', docId, item);
  res.json({ favorited: true, item });
});

router.delete('/favorites/:anilistId', async (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const numId = Number(req.params.anilistId);
  if (!Number.isInteger(numId) || numId <= 0) {
    return res.status(400).json({ error: 'Valid positive integer anime ID is required.' });
  }
  await dbDelete('favorites', `${userId}_${numId}`);
  res.json({ ok: true });
});

router.post('/history', async (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const {
    anilistId,
    animeTitle,
    animeSlug,
    coverImage,
    episodeNumber,
    providerKey,
    language,
    progressSec,
    durationSec,
    completed,
  } = req.body || {};

  const numId = Number(anilistId);
  const epNum = Number(episodeNumber || 1);
  if (!Number.isInteger(numId) || numId <= 0 || !Number.isInteger(epNum) || epNum <= 0) {
    return res.status(400).json({ error: 'Valid anime ID and episode number are required.' });
  }

  const docId = `${userId}_${numId}_${epNum}`;
  const now = new Date().toISOString();
  const item: WatchHistoryItem = {
    id: docId,
    userId,
    anilistId: numId,
    animeTitle: String(animeTitle || `Anime #${numId}`).slice(0, 300),
    animeSlug: String(animeSlug || `${numId}`),
    coverImage: typeof coverImage === 'string' ? coverImage : null,
    episodeNumber: epNum,
    providerKey: String(providerKey || 'yenime'),
    language: language === 'dub' ? 'dub' : 'sub',
    progressSec: Math.max(0, Number(progressSec || 0)),
    durationSec: Math.max(0, Number(durationSec || 0)),
    completed: Boolean(completed),
    watchedAt: now,
  };

  await dbSet('watch_history', docId, item);
  res.json({ item });
});

router.post('/rating', async (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const { anilistId, score, review } = req.body || {};
  const numId = Number(anilistId);
  const numScore = Number(score);
  if (!Number.isInteger(numId) || numId <= 0 || numScore < 1 || numScore > 10) {
    return res.status(400).json({ error: 'Score must be between 1 and 10.' });
  }

  const docId = `${userId}_${numId}`;
  const item: UserRatingItem = {
    id: docId,
    userId,
    anilistId: numId,
    score: Math.round(numScore),
    review: typeof review === 'string' ? review.trim().slice(0, 2000) : null,
    updatedAt: new Date().toISOString(),
  };
  await dbSet('user_ratings', docId, item);
  res.json({ item });
});

router.post('/faceoff-vote', async (req: AuthenticatedRequest, res) => {
  try {
    const { matchupId, winnerAnilistId } = req.body || {};
    if (!matchupId || !winnerAnilistId) {
      return res.status(400).json({ error: 'matchupId and winnerAnilistId are required.' });
    }
    const matchup = await submitFaceOffVote(
      req.authUser!.id,
      String(matchupId),
      Number(winnerAnilistId)
    );
    res.json({ matchup });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Vote failed.' });
  }
});

router.get('/reminders', async (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const reminders = await dbList<PremiereReminder>(
    'premiere_reminders',
    (r) => r.userId === userId
  );
  reminders.sort((a, b) => (a.airingAt || 0) - (b.airingAt || 0));
  res.json({ reminders });
});

router.post('/reminders', async (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const { anilistId, animeTitle, animeSlug, coverImage, airingAt, episode } = req.body || {};
  const numId = Number(anilistId);
  if (!Number.isInteger(numId) || numId <= 0 || !animeTitle) {
    return res.status(400).json({ error: 'Valid anilistId and animeTitle are required.' });
  }
  const docId = `${userId}_${numId}`;
  const item: PremiereReminder = {
    id: docId,
    userId,
    anilistId: numId,
    animeTitle: String(animeTitle).slice(0, 300),
    animeSlug: String(animeSlug || `${numId}`),
    coverImage: typeof coverImage === 'string' ? coverImage : null,
    airingAt: typeof airingAt === 'number' ? airingAt : null,
    episode: typeof episode === 'number' ? episode : null,
    createdAt: new Date().toISOString(),
  };
  await dbSet('premiere_reminders', docId, item);
  res.json({ reminder: item });
});

router.delete('/reminders/:anilistId', async (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const numId = Number(req.params.anilistId);
  if (!Number.isInteger(numId) || numId <= 0) {
    return res.status(400).json({ error: 'Invalid anime ID.' });
  }
  await dbDelete('premiere_reminders', `${userId}_${numId}`);
  res.json({ ok: true });
});

router.get('/collections', async (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const list = await dbList<UserCollection>('user_collections', (c) => c.userId === userId);
  list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const hydrated = await Promise.all(
    list.map(async (col) => {
      const items = await Promise.all(
        (col.anilistIds || []).slice(0, 6).map((id) => getAnimeDetails(id).catch(() => null))
      );
      return {
        ...col,
        items: items.filter((x): x is NonNullable<typeof x> => Boolean(x)),
      };
    })
  );
  res.json({ collections: hydrated });
});

router.post('/collections', async (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const { title, description, anilistIds, isPrivate } = req.body || {};
  const cleanTitle = typeof title === 'string' ? title.trim().slice(0, 120) : '';
  if (!cleanTitle) {
    return res.status(400).json({ error: 'Collection title is required.' });
  }
  const ids = Array.isArray(anilistIds)
    ? Array.from(new Set(anilistIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))).slice(0, 50)
    : [];
  const id = `${userId}_${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date().toISOString();
  const collection: UserCollection = {
    id,
    userId,
    title: cleanTitle,
    description: typeof description === 'string' ? description.trim().slice(0, 400) : null,
    anilistIds: ids,
    isPrivate: isPrivate !== undefined ? Boolean(isPrivate) : true,
    createdAt: now,
    updatedAt: now,
  };
  await dbSet('user_collections', id, collection);
  res.status(201).json({ collection });
});

router.patch('/collections/:id', async (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const existing = await dbGet<UserCollection>('user_collections', req.params.id);
  if (!existing || existing.userId !== userId) {
    return res.status(404).json({ error: 'Collection not found.' });
  }
  const { title, description, anilistIds, addAnilistId, removeAnilistId, isPrivate } = req.body || {};
  let nextIds = Array.isArray(anilistIds)
    ? Array.from(new Set(anilistIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))).slice(0, 50)
    : [...(existing.anilistIds || [])];
  if (addAnilistId && Number.isInteger(Number(addAnilistId))) {
    const aid = Number(addAnilistId);
    if (!nextIds.includes(aid)) nextIds.push(aid);
  }
  if (removeAnilistId && Number.isInteger(Number(removeAnilistId))) {
    const rid = Number(removeAnilistId);
    nextIds = nextIds.filter((x) => x !== rid);
  }

  const updated: UserCollection = {
    ...existing,
    title: typeof title === 'string' && title.trim() ? title.trim().slice(0, 120) : existing.title,
    description:
      description !== undefined
        ? description
          ? String(description).trim().slice(0, 400)
          : null
        : existing.description,
    anilistIds: nextIds,
    isPrivate: isPrivate !== undefined ? Boolean(isPrivate) : existing.isPrivate,
    updatedAt: new Date().toISOString(),
  };
  await dbSet('user_collections', existing.id, updated);
  res.json({ collection: updated });
});

router.delete('/collections/:id', async (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const existing = await dbGet<UserCollection>('user_collections', req.params.id);
  if (!existing || existing.userId !== userId) {
    return res.status(404).json({ error: 'Collection not found.' });
  }
  await dbDelete('user_collections', existing.id);
  res.json({ ok: true });
});

router.get('/preferences', async (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const saved = await dbGet<UniversePreferences>('user_preferences', userId);
  res.json({ preferences: { ...DEFAULT_PREFERENCES, ...(saved || {}) } });
});

router.patch('/preferences', async (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.id;
  const current = (await dbGet<UniversePreferences>('user_preferences', userId)) || DEFAULT_PREFERENCES;
  const body = req.body || {};
  const validThemes = new Set(['midnight-violet', 'obsidian', 'aurora', 'eclipse']);
  const next: UniversePreferences = {
    ...DEFAULT_PREFERENCES,
    ...current,
    visualTheme: validThemes.has(body.visualTheme) ? body.visualTheme : current.visualTheme,
    customAccentHex:
      typeof body.customAccentHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.customAccentHex.trim())
        ? body.customAccentHex.trim()
        : current.customAccentHex,
    compactMode: body.compactMode !== undefined ? Boolean(body.compactMode) : current.compactMode,
    reducedMotion: body.reducedMotion !== undefined ? Boolean(body.reducedMotion) : current.reducedMotion,
    personalizationEnabled:
      body.personalizationEnabled !== undefined
        ? Boolean(body.personalizationEnabled)
        : current.personalizationEnabled,
    profilePublic: body.profilePublic !== undefined ? Boolean(body.profilePublic) : current.profilePublic,
    hideAchievements:
      body.hideAchievements !== undefined ? Boolean(body.hideAchievements) : current.hideAchievements,
    updatedAt: new Date().toISOString(),
  };
  await dbSet('user_preferences', userId, next);
  res.json({ preferences: next });
});

router.get('/universe-summary', async (req: AuthenticatedRequest, res) => {
  try {
    const summary = await buildUserUniverseSummary(req.authUser!.id);
    res.json(summary);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load universe summary.',
    });
  }
});

router.get('/notifications', async (req: AuthenticatedRequest, res) => {
  try {
    const bypassCache = req.query.refresh === '1';
    const result = await getUserWatchlistNotifications(req.authUser!.id, { bypassCache });
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to check watchlist episode updates.',
    });
  }
});

router.post('/notifications/read', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const { id, ids, all } = req.body || {};

    let targetIds: string[] = [];
    if (all === true) {
      const current = await getUserWatchlistNotifications(userId);
      targetIds = current.notifications.map((n) => n.id);
    } else if (Array.isArray(ids)) {
      targetIds = ids.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    } else if (typeof id === 'string' && id.trim()) {
      targetIds = [id.trim()];
    }

    if (targetIds.length === 0 && all !== true) {
      return res.status(400).json({ error: 'Provide notification id, ids, or all: true.' });
    }

    await markUserNotificationsRead(userId, targetIds);
    const updated = await getUserWatchlistNotifications(userId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to update notification read status.',
    });
  }
});

router.post('/notifications/dismiss', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const { id, ids, all } = req.body || {};

    let targetIds: string[] = [];
    if (all === true) {
      const current = await getUserWatchlistNotifications(userId);
      targetIds = current.notifications.map((n) => n.id);
    } else if (Array.isArray(ids)) {
      targetIds = ids.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    } else if (typeof id === 'string' && id.trim()) {
      targetIds = [id.trim()];
    }

    if (targetIds.length === 0 && all !== true) {
      return res.status(400).json({ error: 'Provide notification id, ids, or all: true.' });
    }

    await dismissUserNotifications(userId, targetIds);
    const updated = await getUserWatchlistNotifications(userId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to dismiss notification.',
    });
  }
});

router.patch('/notifications/preferences', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const { includePlanToWatch, includeOnHold } = req.body || {};
    await updateUserNotificationPreferences(userId, {
      ...(includePlanToWatch !== undefined
        ? { includePlanToWatch: Boolean(includePlanToWatch) }
        : {}),
      ...(includeOnHold !== undefined ? { includeOnHold: Boolean(includeOnHold) } : {}),
    });
    const updated = await getUserWatchlistNotifications(userId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to update notification preferences.',
    });
  }
});

export default router;


