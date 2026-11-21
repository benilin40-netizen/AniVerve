import crypto from 'node:crypto';
import { Router } from 'express';
import {
  requireIndependentAdminSession,
  type AdminAuthenticatedRequest,
} from '../middleware/adminAuthMiddleware.ts';
import {
  createDatabaseBackup,
  dbDelete,
  dbGet,
  dbList,
  dbSet,
  ensureDefaultSeedData,
  exportDatabaseSnapshot,
  getDbHealth,
  listDatabaseBackups,
  logSecurityEvent,
} from '../services/db.ts';
import {
  listActiveAdminSessions,
  revokeAllAdminSessions,
  revokeAdminSessionById,
} from '../services/adminAuthService.ts';
import { sanitizeUser, type StoredUserRecord } from '../services/authService.ts';
import { clearCacheByPrefix, getCacheStats } from '../services/cacheService.ts';
import {
  getPlaybackTelemetry,
  getProviders,
  isCoreProviderKey,
  normalizeProviderRecord,
  recordAdminIframeStatus,
  testProviderAdapter,
  validateProviderTemplate,
} from '../providers/providerRegistry.ts';
import { validateProviderBaseUrl } from '../../src/providers/adapters/index.ts';
import { getAnimeDetails } from '../services/anilistService.ts';
import {
  createAdminNotification,
  getDefaultHomepageConfig,
  getHomepageUniverseConfig,
  listAdminNotifications,
  listCuratedCollections,
  patchHomepageUniverseConfig,
} from '../services/universeService.ts';
import {
  getBackgroundJobStatuses,
  runScheduleRefreshJob,
} from '../jobs/refreshJobs.ts';
import type {
  AdminNotificationItem,
  CuratedCollection,
  ErrorLogEntry,
  SecurityLogEntry,
  StreamingProvider,
  SystemSettings,
  UserRole,
  WatchlistItem,
} from '../../src/types/anime.ts';

const router = Router();
router.use(requireIndependentAdminSession);

async function logAdminActivity(
  adminId: string,
  adminEmail: string,
  action: string,
  target: string,
  details?: any
) {
  const id = crypto.randomUUID();
  await dbSet('admin_activity', id, {
    id,
    adminId,
    adminEmail,
    action,
    target,
    details: details || null,
    createdAt: new Date().toISOString(),
  });
}

function isAutoProbeString(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return (
    lower.startsWith('live probe') ||
    lower.startsWith('technical http probe') ||
    lower.startsWith('verified via live') ||
    lower === 'primary playback server.' ||
    lower === 'automatic backup server.'
  );
}

router.get('/overview', async (_req, res) => {
  await ensureDefaultSeedData();
  const [
    users,
    watchlists,
    history,
    providers,
    telemetry,
    overrides,
    activities,
    errorLogs,
    securityLogs,
  ] = await Promise.all([
    dbList<StoredUserRecord>('users'),
    dbList('watchlists'),
    dbList('watch_history'),
    getProviders(true),
    getPlaybackTelemetry(),
    dbList('anime_catalog_overrides'),
    dbList('admin_activity'),
    dbList<ErrorLogEntry>('error_logs'),
    dbList<SecurityLogEntry>('security_logs'),
  ]);

  activities.sort(
    (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  errorLogs.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  securityLogs.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  res.json({
    stats: {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.status === 'ACTIVE').length,
      totalCatalogOverrides: overrides.length,
      totalWatchlistEntries: watchlists.length,
      totalWatchHistory: history.length,
      activeProviders: providers.filter(
        (p) => p.isEnabled && p.licenseVerified && p.embeddingAllowed !== false
      ).length,
      totalProviders: providers.length,
    },
    playbackTelemetry: telemetry,
    dbHealth: getDbHealth(),
    backups: listDatabaseBackups(),
    cacheStats: getCacheStats(),
    jobs: getBackgroundJobStatuses(),
    recentActivities: activities.slice(0, 25),
    errorLogs: errorLogs.slice(0, 40),
    securityLogs: securityLogs.slice(0, 40),
  });
});

// A. User Management
router.get('/users', async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const users = await dbList<StoredUserRecord>('users');
  const filtered = users
    .filter((u) => {
      if (!search) return true;
      return u.email.toLowerCase().includes(search) || u.username.toLowerCase().includes(search);
    })
    .map(sanitizeUser)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ users: filtered });
});

router.patch('/users/:id', async (req: AdminAuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const target = await dbGet<StoredUserRecord>('users', targetId);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const { status, role } = req.body || {};
  const updates: Partial<StoredUserRecord> = { updatedAt: new Date().toISOString() };

  if (status === 'ACTIVE' || status === 'SUSPENDED') {
    updates.status = status;
  }

  if (role && ['USER', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
    updates.role = role as UserRole;
  }

  const updated = await dbSet('users', targetId, { ...target, ...updates });
  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'UPDATE_USER', target.email, updates);
  await logSecurityEvent({
    userId: target.id,
    email: target.email,
    event: 'ADMIN_USER_UPDATED',
    success: true,
    ipAddress: req.ip || null,
    details: `Updated by admin console: ${JSON.stringify(updates)}`,
  });
  res.json({ user: sanitizeUser(updated) });
});

router.delete('/users/:id', async (req: AdminAuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const target = await dbGet<StoredUserRecord>('users', targetId);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const userKeyedCollections = [
    'sessions',
    'watchlists',
    'favorites',
    'watch_history',
    'user_ratings',
    'user_collections',
    'premiere_reminders',
    'anime_faceoff_votes',
  ];
  for (const col of userKeyedCollections) {
    const matches = await dbList<{ id: string; userId?: string }>(
      col,
      (item) => item.userId === targetId
    );
    for (const item of matches) {
      await dbDelete(col, item.id);
    }
  }
  await dbDelete('user_preferences', targetId);
  await dbDelete('user_notification_states', targetId);
  await dbDelete('users', targetId);

  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'DELETE_USER', target.email);
  res.json({ ok: true });
});

// B. Anime Catalog Management
router.get('/catalog', async (_req, res) => {
  const overrides = await dbList('anime_catalog_overrides');
  res.json({ overrides });
});

router.post('/catalog', async (req: AdminAuthenticatedRequest, res) => {
  const { anilistId, featured, hidden, categories } = req.body || {};
  const numId = Number(anilistId);
  if (!Number.isInteger(numId) || numId <= 0) {
    return res.status(400).json({ error: 'Valid AniList ID is required.' });
  }

  const anime = await getAnimeDetails(numId);
  if (!anime) {
    return res.status(404).json({ error: 'Anime not found on AniList.' });
  }

  const existing = await dbGet<any>('anime_catalog_overrides', String(numId));
  const record = {
    id: String(numId),
    anilistId: numId,
    featured: featured !== undefined ? Boolean(featured) : Boolean(existing?.featured),
    hidden: hidden !== undefined ? Boolean(hidden) : Boolean(existing?.hidden),
    categories: Array.isArray(categories) ? categories.map(String) : existing?.categories || [],
    anime: {
      id: anime.id,
      idMal: anime.idMal,
      slug: anime.slug,
      title: anime.title,
      format: anime.format,
      status: anime.status,
      season: anime.season,
      seasonYear: anime.seasonYear,
      episodes: anime.episodes,
      duration: anime.duration,
      averageScore: anime.averageScore,
      popularity: anime.popularity,
      genres: anime.genres,
      coverImage: anime.coverImage,
      bannerImage: anime.bannerImage,
      description: anime.description,
      trailer: anime.trailer,
      studios: anime.studios,
      nextAiringEpisode: anime.nextAiringEpisode,
    },
    updatedAt: new Date().toISOString(),
  };

  await dbSet('anime_catalog_overrides', String(numId), record);
  clearCacheByPrefix('anilist:detail:' + numId);
  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'UPDATE_CATALOG', String(numId), {
    featured: record.featured,
    hidden: record.hidden,
  });
  res.json({ override: record });
});

router.post('/catalog/:anilistId/refresh', async (req: AdminAuthenticatedRequest, res) => {
  const numId = Number(req.params.anilistId);
  if (!Number.isInteger(numId) || numId <= 0) {
    return res.status(400).json({ error: 'Valid positive integer AniList ID is required.' });
  }
  clearCacheByPrefix(`anilist:detail:${numId}`);
  const anime = await getAnimeDetails(numId);
  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'REFRESH_ANIME_META', String(numId));
  res.json({ anime });
});

// C. Unified Playback System (Yenime Primary + AniEmbed Backup)
router.get('/playback-system', async (_req, res) => {
  const [providers, telemetry] = await Promise.all([
    getProviders(true),
    getPlaybackTelemetry(),
  ]);
  res.json({
    telemetry,
    providers,
    primary: providers.find((p) => p.priority === 1) || providers[0] || null,
    backup: providers.find((p) => p.priority > 1) || providers[1] || null,
  });
});

router.get('/providers', async (_req, res) => {
  const providers = await getProviders(true);
  res.json({ providers });
});

router.post('/providers', (_req, res) => {
  res.status(400).json({
    error: 'Only Yenime and AniEmbed are supported in the unified playback system.',
  });
});

router.patch('/providers/:key', async (req: AdminAuthenticatedRequest, res) => {
  const key = req.params.key.trim().toLowerCase();
  if (!isCoreProviderKey(key)) {
    return res.status(404).json({
      error: 'Only Yenime and AniEmbed are supported in the unified playback system.',
    });
  }

  const rawExisting = await dbGet<StreamingProvider & { documentedPermission?: boolean }>(
    'anime_providers',
    key
  );
  if (!rawExisting) return res.status(404).json({ error: 'Provider not found.' });
  const existing = normalizeProviderRecord(rawExisting);

  const {
    name,
    baseUrl,
    urlTemplate,
    supportedLanguages,
    isEnabled,
    licenseVerified,
    verificationNotes,
    priority,
    resetErrors,
  } = req.body || {};

  const nextBaseUrl =
    baseUrl !== undefined ? String(baseUrl).trim() : (existing.baseUrl || '').trim();
  const nextUrlTemplate =
    urlTemplate !== undefined ? String(urlTemplate).trim() : (existing.urlTemplate || '').trim();
  const templateChanged = urlTemplate !== undefined && nextUrlTemplate !== existing.urlTemplate;
  const baseChanged = baseUrl !== undefined && nextBaseUrl !== existing.baseUrl;

  if (baseUrl !== undefined || urlTemplate !== undefined) {
    const requiredBaseHostname =
      key === 'yenime' ? 'api.yenime.net' : 'aniembed.se';
    const baseValidation = validateProviderBaseUrl(nextBaseUrl, {
      requiredBaseHostname,
      providerName: existing.name,
    });
    if (!baseValidation.valid) {
      return res.status(400).json({ error: baseValidation.error, stage: baseValidation.stage });
    }

    const validation = validateProviderTemplate(nextUrlTemplate, {
      key,
      baseUrl: nextBaseUrl,
    });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error, stage: validation.stage });
    }
  }

  const nextNotes =
    verificationNotes !== undefined
      ? verificationNotes
        ? String(verificationNotes).trim().slice(0, 500)
        : null
      : existing.verificationNotes;

  const nextLicenseVerified =
    licenseVerified !== undefined
      ? Boolean(licenseVerified)
      : templateChanged || baseChanged
        ? false
        : existing.licenseVerified;

  // Truth Mode: Never mark a provider as licensed without documented permission AND framing probe evidence
  if (licenseVerified === true) {
    if (!nextNotes || nextNotes.length < 12 || isAutoProbeString(nextNotes)) {
      return res.status(400).json({
        error:
          'Documented distribution permission reference (at least 12 characters describing authorization) is required before verifying license.',
      });
    }
    if (!existing.embeddingAllowed && existing.lastHttpStatus !== 200) {
      return res.status(400).json({
        error:
          'Technical framing probe has not passed yet. Run Verify Permission & Probe with your documented permission note.',
      });
    }
  }

  const nextEnabled = isEnabled !== undefined ? Boolean(isEnabled) : existing.isEnabled;

  if (nextEnabled) {
    if (!nextUrlTemplate) {
      return res.status(400).json({
        error: `${existing.name} cannot be enabled without a valid HTTPS URL template.`,
      });
    }
    if (!nextLicenseVerified) {
      return res.status(400).json({
        error: `${existing.name} cannot be enabled until documented distribution permission is recorded and technical embedding is verified.`,
      });
    }
    if (!templateChanged && existing.embeddingAllowed === false) {
      return res.status(400).json({
        error: `${existing.name} cannot be enabled because upstream framing headers block embedding.`,
      });
    }
  }

  const nextLanguages = Array.isArray(supportedLanguages)
    ? supportedLanguages
        .map((l) => String(l).trim().toLowerCase())
        .filter((l) => l === 'sub' || l === 'dub')
    : existing.supportedLanguages;

  const requestedPriority =
    priority !== undefined ? Math.max(1, Math.min(3, Math.round(Number(priority)))) : existing.priority;
  const nextRole = requestedPriority === 1 ? 'primary' : 'backup';

  if (priority !== undefined && requestedPriority !== existing.priority) {
    const allStored = await getProviders(true);
    const conflicting = allStored.find(
      (p) => p.key !== key && p.priority === requestedPriority
    );
    if (conflicting) {
      await dbSet('anime_providers', conflicting.key, {
        ...conflicting,
        priority: existing.priority,
        role: existing.priority === 1 ? 'primary' : 'backup',
      });
    }
  }

  const updated = {
    ...normalizeProviderRecord({
      ...existing,
      name: name !== undefined ? String(name).trim() || existing.name : existing.name,
      role: nextRole,
      baseUrl: nextBaseUrl,
      urlTemplate: nextUrlTemplate,
      supportedIdTypes:
        key === 'yenime' ? ['mal', 'anilist'] : ['anilist'],
      supportedLanguages:
        nextLanguages.length > 0
          ? nextLanguages
          : existing.supportedLanguages,
      isEnabled: nextLicenseVerified && nextUrlTemplate ? nextEnabled : false,
      licenseVerified: nextUrlTemplate ? nextLicenseVerified : false,
      embeddingAllowed: templateChanged ? null : existing.embeddingAllowed,
      apiReachable: baseChanged || templateChanged ? null : existing.apiReachable ?? null,
      playerInitialized: templateChanged ? null : existing.playerInitialized ?? null,
      availabilityStatus:
        !nextUrlTemplate || !nextBaseUrl
          ? 'unconfigured'
          : templateChanged || baseChanged
            ? 'unverified'
            : !nextLicenseVerified
              ? 'unverified'
              : existing.availabilityStatus,
      verificationNotes: nextNotes,
      verifiedAt:
        nextLicenseVerified && (!existing.verifiedAt || licenseVerified === true)
          ? new Date().toISOString()
          : nextLicenseVerified
            ? existing.verifiedAt
            : null,
      priority: requestedPriority,
      errorCount: resetErrors ? 0 : existing.errorCount,
      lastError: resetErrors ? null : existing.lastError,
    }),
    documentedPermission: Boolean(nextLicenseVerified),
  };

  if (baseChanged || templateChanged) {
    clearCacheByPrefix(`provider:probe:`);
  }

  await dbSet('anime_providers', key, updated);
  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'UPDATE_PROVIDER', key, {
    isEnabled: updated.isEnabled,
    priority: updated.priority,
    licenseVerified: updated.licenseVerified,
  });
  if (licenseVerified !== undefined || isEnabled !== undefined) {
    await logSecurityEvent({
      userId: req.adminActor!.id,
      email: req.adminActor!.email,
      event: 'ADMIN_PROVIDER_PERMISSION_CHANGED',
      success: true,
      ipAddress: req.ip || null,
      details: `provider=${key} licenseVerified=${updated.licenseVerified} isEnabled=${updated.isEnabled}`,
    });
  }
  res.json({ provider: updated });
});

router.post('/providers/:key/iframe-status', async (req: AdminAuthenticatedRequest, res) => {
  const key = req.params.key.trim().toLowerCase();
  if (!isCoreProviderKey(key)) {
    return res.status(404).json({ error: 'Only Yenime and AniEmbed are supported.' });
  }
  const { initialized, error } = req.body || {};
  await recordAdminIframeStatus(
    key,
    Boolean(initialized),
    typeof error === 'string' ? error : null
  );
  res.json({ ok: true });
});

router.delete('/providers/:key', (_req, res) => {
  res.status(400).json({
    error: 'Core unified playback servers cannot be deleted. Disable them instead.',
  });
});

router.post('/providers/test', async (req, res) => {
  const { key, baseUrl, urlTemplate, anilistId, episode, track, autoPlay, startSec, persist, mode } =
    req.body || {};
  const cleanKey = String(key || '').trim().toLowerCase();
  if (!isCoreProviderKey(cleanKey)) {
    return res.status(400).json({ error: 'Only Yenime and AniEmbed can be tested.' });
  }
  const existing = await dbGet<StreamingProvider>('anime_providers', cleanKey);
  const result = await testProviderAdapter(
    existing
      ? {
          ...existing,
          baseUrl: baseUrl !== undefined ? String(baseUrl) : existing.baseUrl,
          urlTemplate: urlTemplate !== undefined ? String(urlTemplate) : existing.urlTemplate,
        }
      : {
          key: cleanKey,
          name: cleanKey === 'aniembed' ? 'AniEmbed' : 'Yenime',
          baseUrl: baseUrl ? String(baseUrl) : '',
          urlTemplate: String(urlTemplate || ''),
          supportedLanguages: ['sub', 'dub'],
          supportedIdTypes: ['anilist'],
        },
    {
      anilistId: Number(anilistId || 16498),
      episode: Number(episode || 1),
      track: track === 'dub' ? 'dub' : 'sub',
      autoPlay: Boolean(autoPlay),
      startSec: Number(startSec || 0),
      persist: Boolean(persist && existing && mode !== 'url'),
      mode: mode === 'url' ? 'url' : 'probe',
      force: true,
    }
  );
  res.json(result);
});

router.post('/providers/test-all', async (req: AdminAuthenticatedRequest, res) => {
  const { anilistId, episode, track } = req.body || {};
  const providers = await getProviders(true);
  const results = await Promise.all(
    providers.map((provider) =>
      testProviderAdapter(provider, {
        anilistId: Number(anilistId || 16498),
        episode: Number(episode || 1),
        track: track === 'dub' ? 'dub' : 'sub',
        persist: true,
        force: true,
      })
    )
  );
  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'PROBE_ALL_PROVIDERS', 'unified', {
    anilistId: Number(anilistId || 16498),
    episode: Number(episode || 1),
  });
  res.json({ results });
});

router.post('/providers/:key/verify', async (req: AdminAuthenticatedRequest, res) => {
  const key = req.params.key.trim().toLowerCase();
  if (!isCoreProviderKey(key)) {
    return res.status(404).json({ error: 'Only Yenime and AniEmbed are supported.' });
  }
  const rawExisting = await dbGet<StreamingProvider>('anime_providers', key);
  if (!rawExisting) return res.status(404).json({ error: 'Provider not found.' });
  const existing = normalizeProviderRecord(rawExisting);

  const { verified, verificationNotes, anilistId, episode } = req.body || {};
  if (!verified) {
    const revoked = {
      ...normalizeProviderRecord({
        ...existing,
        licenseVerified: false,
        isEnabled: false,
        verifiedAt: null,
        verificationNotes:
          verificationNotes !== undefined
            ? String(verificationNotes).slice(0, 500)
            : 'Documented permission revoked by administrator.',
        availabilityStatus: existing.urlTemplate ? 'unverified' : 'unconfigured',
      }),
      documentedPermission: false,
    };
    await dbSet('anime_providers', key, revoked);
    await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'REVOKE_PROVIDER_LICENSE', key);
    await logSecurityEvent({
      userId: req.adminActor!.id,
      email: req.adminActor!.email,
      event: 'PROVIDER_PERMISSION_REVOKED',
      success: true,
      ipAddress: req.ip || null,
      details: `provider=${key}`,
    });
    return res.json({ provider: revoked, testResult: null });
  }

  const trimmedNotes = typeof verificationNotes === 'string' ? verificationNotes.trim() : '';
  if (trimmedNotes.length < 12 || isAutoProbeString(trimmedNotes)) {
    return res.status(400).json({
      error:
        'Documented permission note required (at least 12 characters referencing written/partner authorization). HTTP probes alone do not verify distribution rights.',
    });
  }

  const testResult = await testProviderAdapter(existing, {
    anilistId: Number(anilistId || 16498),
    episode: Number(episode || 1),
    track: 'sub',
    persist: true,
    force: true,
  });

  if (!testResult.configured) {
    return res.status(400).json({
      error: testResult.error || 'Provider endpoint is not configured.',
      testResult,
    });
  }
  if (!testResult.reachable) {
    return res.status(422).json({
      error: `Technical episode probe failed (${testResult.error || `HTTP ${testResult.status}`}). Cannot verify availability until a test episode succeeds.`,
      testResult,
    });
  }
  if (!testResult.embeddingAllowed) {
    return res.status(422).json({
      error:
        testResult.error ||
        'Upstream framing policy prohibits embedding. Cannot verify embedding permission.',
      testResult,
    });
  }

  const verifiedProvider = {
    ...normalizeProviderRecord({
      ...existing,
      licenseVerified: true,
      embeddingAllowed: true,
      availabilityStatus: 'available',
      lastHttpStatus: testResult.status,
      lastCheckedAt: testResult.testedAt,
      lastError: null,
      verifiedAt: new Date().toISOString(),
      verificationNotes: trimmedNotes.slice(0, 500),
    }),
    documentedPermission: true,
  };

  await dbSet('anime_providers', key, verifiedProvider);
  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'RECORD_PROVIDER_PERMISSION', key, {
    notes: trimmedNotes.slice(0, 120),
  });
  await logSecurityEvent({
    userId: req.adminActor!.id,
    email: req.adminActor!.email,
    event: 'PROVIDER_PERMISSION_VERIFIED',
    success: true,
    ipAddress: req.ip || null,
    details: `provider=${key} note=${trimmedNotes.slice(0, 100)}`,
  });
  res.json({ provider: verifiedProvider, testResult });
});

// D. Content & Homepage Visual Editor
router.get('/universe-config', async (_req, res) => {
  const config = await getHomepageUniverseConfig();
  res.json({ config });
});

router.patch('/universe-config', async (req: AdminAuthenticatedRequest, res) => {
  const config = await patchHomepageUniverseConfig(req.body || {});
  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'UPDATE_UNIVERSE_CONFIG', 'homepage', {
    heroMode: config.heroMode,
    publishedAt: config.publishedAt,
  });
  res.json({ config });
});

router.post('/universe-config/reset', async (req: AdminAuthenticatedRequest, res) => {
  const def = getDefaultHomepageConfig();
  await dbSet('universe_configs', 'homepage', def);
  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'RESET_UNIVERSE_CONFIG', 'homepage');
  res.json({ config: def });
});

router.get('/collections', async (_req, res) => {
  const collections = await listCuratedCollections({ includeUnpublished: true, hydrateItems: false });
  res.json({ collections });
});

router.post('/collections', async (req: AdminAuthenticatedRequest, res) => {
  const { title, subtitle, description, themeTag, accentHex, anilistIds, published } = req.body || {};
  const cleanTitle = typeof title === 'string' ? title.trim().slice(0, 120) : '';
  if (!cleanTitle) {
    return res.status(400).json({ error: 'Collection title is required.' });
  }
  const slug = cleanTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const id = slug || `col-${crypto.randomBytes(4).toString('hex')}`;
  const existing = await listCuratedCollections({ includeUnpublished: true, hydrateItems: false });

  const item: CuratedCollection = {
    id,
    slug: id,
    title: cleanTitle,
    subtitle: typeof subtitle === 'string' ? subtitle.trim().slice(0, 180) : '',
    description: typeof description === 'string' ? description.trim().slice(0, 400) : '',
    themeTag: typeof themeTag === 'string' && themeTag.trim() ? themeTag.trim().slice(0, 40) : 'Editorial',
    accentHex:
      typeof accentHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(accentHex.trim())
        ? accentHex.trim()
        : '#9B87FF',
    anilistIds: Array.isArray(anilistIds)
      ? anilistIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [],
    isOfficial: true,
    published: published !== undefined ? Boolean(published) : true,
    sortOrder: existing.length + 1,
    updatedAt: new Date().toISOString(),
  };

  await dbSet('anime_collections', id, item);
  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'CREATE_COLLECTION', id);
  res.status(201).json({ collection: item });
});

router.patch('/collections/:id', async (req: AdminAuthenticatedRequest, res) => {
  const existing = await dbGet<CuratedCollection>('anime_collections', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Collection not found.' });
  const body = req.body || {};
  const updated: CuratedCollection = {
    ...existing,
    title: typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 120) : existing.title,
    subtitle: body.subtitle !== undefined ? String(body.subtitle).slice(0, 180) : existing.subtitle,
    description: body.description !== undefined ? String(body.description).slice(0, 400) : existing.description,
    themeTag: body.themeTag !== undefined ? String(body.themeTag).slice(0, 40) : existing.themeTag,
    accentHex:
      typeof body.accentHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.accentHex.trim())
        ? body.accentHex.trim()
        : existing.accentHex,
    anilistIds: Array.isArray(body.anilistIds)
      ? body.anilistIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
      : existing.anilistIds,
    published: body.published !== undefined ? Boolean(body.published) : existing.published,
    sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : existing.sortOrder,
    updatedAt: new Date().toISOString(),
  };
  await dbSet('anime_collections', existing.id, updated);
  clearCacheByPrefix(`universe:col:${existing.id}`);
  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'UPDATE_COLLECTION', existing.id);
  res.json({ collection: updated });
});

router.delete('/collections/:id', async (req: AdminAuthenticatedRequest, res) => {
  await dbDelete('anime_collections', req.params.id);
  clearCacheByPrefix(`universe:col:${req.params.id}`);
  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'DELETE_COLLECTION', req.params.id);
  res.json({ ok: true });
});

// E. Security Center & Notifications
router.get('/sessions', async (req: AdminAuthenticatedRequest, res) => {
  const sessions = await listActiveAdminSessions(req.adminSession?.id);
  res.json({ sessions });
});

router.delete('/sessions/:id', async (req: AdminAuthenticatedRequest, res) => {
  const target = req.params.id;
  if (target === 'others') {
    const revoked = await revokeAllAdminSessions(req.adminSession?.id);
    await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'REVOKE_OTHER_ADMIN_SESSIONS', `${revoked}`);
    return res.json({ ok: true, revoked });
  }
  const ok = await revokeAdminSessionById(target);
  if (!ok) return res.status(404).json({ error: 'Admin session not found.' });
  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'REVOKE_ADMIN_SESSION', target);
  res.json({ ok: true });
});

router.get('/notifications', async (_req, res) => {
  const [providers, notifications] = await Promise.all([
    getProviders(true),
    listAdminNotifications(),
  ]);
  const alerts: AdminNotificationItem[] = [...notifications];
  for (const p of providers) {
    if (!p.isEnabled || p.healthState === 'FAILED') {
      alerts.unshift({
        id: `auto_provider_${p.key}`,
        severity: p.healthState === 'FAILED' ? 'critical' : 'warning',
        category: 'provider',
        title: `${p.name} playback attention`,
        message: p.lastError || `Provider state is ${p.healthState || p.availabilityStatus}.`,
        acknowledged: false,
        createdAt: p.lastCheckedAt || new Date().toISOString(),
      });
    }
  }
  res.json({ notifications: alerts.slice(0, 40) });
});

router.post('/notifications', async (req: AdminAuthenticatedRequest, res) => {
  const { title, message, severity, category } = req.body || {};
  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required.' });
  }
  const item = await createAdminNotification({
    severity: severity === 'critical' || severity === 'warning' ? severity : 'info',
    category: ['provider', 'security', 'system', 'content'].includes(category) ? category : 'system',
    title: String(title),
    message: String(message),
  });
  res.status(201).json({ notification: item });
});

router.patch('/notifications/:id/ack', async (req, res) => {
  const existing = await dbGet<AdminNotificationItem>('admin_notifications', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Notification not found.' });
  const updated = await dbSet('admin_notifications', existing.id, { ...existing, acknowledged: true });
  res.json({ notification: updated });
});

// F. Platform Analytics (strictly derived from real DB records & telemetry)
router.get('/analytics', async (_req, res) => {
  const [users, watchlists, favorites, history, ratings, reminders, collections, votes] =
    await Promise.all([
      dbList<StoredUserRecord>('users'),
      dbList<WatchlistItem>('watchlists'),
      dbList('favorites'),
      dbList('watch_history'),
      dbList('user_ratings'),
      dbList('premiere_reminders'),
      dbList('user_collections'),
      dbList('anime_faceoff_votes'),
    ]);

  const statusBreakdown = {
    WATCHING: 0,
    COMPLETED: 0,
    PLAN_TO_WATCH: 0,
    ON_HOLD: 0,
    DROPPED: 0,
  };
  const topTrackedMap = new Map<number, { anilistId: number; title: string; count: number }>();

  for (const w of watchlists) {
    if (w.status in statusBreakdown) {
      statusBreakdown[w.status]++;
    }
    const prev = topTrackedMap.get(w.anilistId) || {
      anilistId: w.anilistId,
      title: w.animeTitle,
      count: 0,
    };
    prev.count += 1;
    topTrackedMap.set(w.anilistId, prev);
  }

  const topTrackedAnime = Array.from(topTrackedMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  res.json({
    totals: {
      users: users.length,
      watchlists: watchlists.length,
      favorites: favorites.length,
      historyEvents: history.length,
      ratings: ratings.length,
      reminders: reminders.length,
      userCollections: collections.length,
      faceOffVotes: votes.length,
    },
    statusBreakdown,
    topTrackedAnime,
    cacheStats: getCacheStats(),
  });
});

// G. Schedule Refresh & Website Settings
router.post('/schedule/refresh', async (req: AdminAuthenticatedRequest, res) => {
  clearCacheByPrefix('anilist:schedule:');
  await runScheduleRefreshJob();
  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'REFRESH_SCHEDULE', 'anilist');
  res.json({ ok: true });
});

router.get('/settings', async (_req, res) => {
  await ensureDefaultSeedData();
  const settings = await dbGet<SystemSettings>('system_settings', 'global');
  res.json({ settings });
});

router.patch('/settings', async (req: AdminAuthenticatedRequest, res) => {
  await ensureDefaultSeedData();
  const current = (await dbGet<SystemSettings>('system_settings', 'global')) || ({} as SystemSettings);
  const body = req.body || {};

  const safeColor =
    typeof body.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.accentColor.trim())
      ? body.accentColor.trim()
      : current.accentColor;

  const updated: SystemSettings = {
    ...current,
    siteName: body.siteName !== undefined ? String(body.siteName).slice(0, 80) : current.siteName,
    logoUrl: body.logoUrl !== undefined ? String(body.logoUrl).slice(0, 500) : current.logoUrl,
    faviconUrl:
      body.faviconUrl !== undefined ? String(body.faviconUrl).slice(0, 500) : current.faviconUrl,
    accentColor: safeColor,
    maintenanceMode:
      body.maintenanceMode !== undefined ? Boolean(body.maintenanceMode) : current.maintenanceMode,
    allowRegistration:
      body.allowRegistration !== undefined ? Boolean(body.allowRegistration) : current.allowRegistration,
    seoTitle: body.seoTitle !== undefined ? String(body.seoTitle).slice(0, 160) : current.seoTitle,
    seoDescription:
      body.seoDescription !== undefined
        ? String(body.seoDescription).slice(0, 300)
        : current.seoDescription,
    featuredSections: Array.isArray(body.featuredSections)
      ? body.featuredSections.map(String)
      : current.featuredSections,
  };

  await dbSet('system_settings', 'global', updated);
  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'UPDATE_SETTINGS', 'global', {
    maintenanceMode: updated.maintenanceMode,
    allowRegistration: updated.allowRegistration,
  });
  res.json({ settings: updated });
});

// H. System Monitoring, Backups, Export & Cache
router.post('/cache/clear', async (req: AdminAuthenticatedRequest, res) => {
  const cleared = clearCacheByPrefix('');
  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'CLEAR_CACHE', `${cleared} entries`);
  res.json({ cleared });
});

router.post('/backup', async (req: AdminAuthenticatedRequest, res) => {
  const backup = await createDatabaseBackup();
  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'CREATE_DB_BACKUP', backup.filename);
  res.json({ backup, backups: listDatabaseBackups() });
});

router.get('/database/export', async (req: AdminAuthenticatedRequest, res) => {
  const snapshot = await exportDatabaseSnapshot();
  await logAdminActivity(req.adminActor!.id, req.adminActor!.email, 'EXPORT_DATABASE_JSON', 'snapshot');
  res.setHeader('Content-Disposition', 'attachment; filename="aniverve-db-export.json"');
  res.json(snapshot);
});

export default router;
