import { Router } from 'express';
import {
  getPlaybackTelemetry,
  getProviders,
  isCoreProviderKey,
  isProviderActivated,
  recordPlaybackFailover,
  recordPlaybackSuccess,
  recordProviderError,
  testProviderAdapter,
} from '../providers/providerRegistry.ts';

import { getAnimeDetails } from '../services/anilistService.ts';
import { getCached, setCached } from '../services/cacheService.ts';
import { resolveEpisodeSources } from '../services/episodeDiscoveryService.ts';
import { proxyUpstreamMedia } from '../services/hlsProxyService.ts';
import { telemetryEventSchema, validateBody } from '../validation/schemas.ts';
import type { ProviderTestResult } from '../../src/types/anime.ts';

const router = Router();

export async function buildProviderStatusPayload() {
  const [allProviders, telemetry] = await Promise.all([
    getProviders(true),
    getPlaybackTelemetry(),
  ]);
  const activeProviders = await getProviders(false);
  const registry = allProviders.map((p) => ({
    key: p.key,
    name: p.name,
    role: p.priority <= 1 ? ('primary' as const) : ('backup' as const),
    adapterType: p.adapterType,
    supportedIdTypes: p.supportedIdTypes,
    supportedLanguages: p.supportedLanguages,
    supportedFormats:
      p.supportedFormats || (p.key === 'yenime' ? ['hls', 'embed'] : ['embed']),
    isEnabled: p.isEnabled,
    licenseVerified: p.licenseVerified,
    embeddingAllowed: p.embeddingAllowed,
    availabilityStatus: p.availabilityStatus,
    healthState: p.healthState || 'READY',
    apiHealthState: p.apiHealthState || 'healthy',
    playbackHealthState: p.playbackHealthState || 'healthy',
    operationalStatus: p.operationalStatus || 'Healthy',
    consecutiveFailures: p.consecutiveFailures ?? 0,
    averageResponseTimeMs: p.averageResponseTimeMs ?? null,
    cooldownUntil: p.cooldownUntil ?? null,
    diagnostics: p.diagnostics,
    priority: p.priority,
    errorCount: p.errorCount,
    lastError: p.lastError || null,
    lastCheckedAt: p.lastCheckedAt || null,
    lastSuccessAt: p.lastSuccessAt || null,
    activated: isProviderActivated(p),
  }));

  return {
    providers: activeProviders,
    registry,
    primary: activeProviders[0] || null,
    backup: activeProviders[1] || null,
    telemetry,
    checkedAt: new Date().toISOString(),
  };
}

router.get('/providers', async (_req, res) => {
  try {
    const payload = await buildProviderStatusPayload();
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load providers.' });
  }
});

router.get('/availability', async (req, res) => {
  try {
    const anilistId = Number(req.query.anilistId || 16498);
    const episode = Number(req.query.episode || 1);
    const forceRefresh = req.query.refresh === '1';

    if (!Number.isInteger(anilistId) || anilistId <= 0) {
      return res.status(400).json({ error: 'Valid positive AniList ID is required.' });
    }
    if (!Number.isFinite(episode) || episode < 0) {
      return res.status(400).json({ error: 'Valid non-negative episode number is required.' });
    }

    const cacheKey = `streaming:availability:${anilistId}:${episode}`;
    if (!forceRefresh) {
      const cached = getCached<ProviderTestResult[]>(cacheKey);
      if (cached) {
        return res.json({ anilistId, episode, cached: true, results: cached });
      }
    }

    const allProviders = await getProviders(true);
    const settled = await Promise.allSettled(
      allProviders.map((provider) =>
        testProviderAdapter(provider, {
          anilistId,
          episode,
          track: 'sub',
          persist: true,
          force: forceRefresh,
        })
      )
    );

    const results: ProviderTestResult[] = settled.map((outcome, idx) => {
      if (outcome.status === 'fulfilled') return outcome.value;
      const p = allProviders[idx];
      return {
        providerKey: p.key,
        providerName: p.name,
        configured: true,
        urlValid: true,
        hostnameValid: true,
        apiReachable: false,
        reachable: false,
        embeddingAllowed: true,
        playerInitialized: false,
        availabilityStatus: 'error',
        status: 0,
        latencyMs: 0,
        resolvedUrl: null,
        xFrameOptions: null,
        frameAncestors: null,
        failedStage: 'api_connectivity',
        error: outcome.reason instanceof Error ? outcome.reason.message : 'Provider probe failed',
        testedAt: new Date().toISOString(),
        stages: {
          urlSyntax: { passed: true, message: 'Syntax valid' },
          hostname: { passed: true, message: 'Hostname valid' },
          apiConnectivity: {
            passed: false,
            status: 0,
            latencyMs: 0,
            message: outcome.reason instanceof Error ? outcome.reason.message : 'Probe rejected',
          },
          playerUrlGeneration: { passed: null, url: null, message: 'Skipped' },
          iframeInitialization: {
            passed: null,
            status: 0,
            xFrameOptions: null,
            frameAncestors: null,
            message: 'Skipped',
          },
        },
      };
    });

    setCached(cacheKey, results, 60);
    res.json({ anilistId, episode, cached: false, results });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to detect provider availability.',
    });
  }
});

router.get('/id-mapping/:anilistId', async (req, res) => {
  try {
    const anilistId = Number(req.params.anilistId);
    if (!Number.isInteger(anilistId) || anilistId <= 0) {
      return res.status(400).json({ error: 'Valid positive AniList ID is required.' });
    }
    const anime = await getAnimeDetails(anilistId);
    if (!anime) {
      return res.status(404).json({ error: 'Anime not found on AniList.' });
    }
    res.json({
      anilistId: anime.id,
      malId: anime.idMal ?? null,
      title: anime.title,
      episodes: anime.episodes ?? null,
      status: anime.status ?? null,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to resolve ID mapping.',
    });
  }
});

router.get('/resolve', async (req, res) => {
  try {
    const anilistId = Number(req.query.anilistId);
    const episode = req.query.episode !== undefined ? Number(req.query.episode) : 1;
    const providerKey =
      typeof req.query.provider === 'string' ? req.query.provider.trim().toLowerCase() : '';
    const lang = req.query.lang === 'dub' ? 'dub' : 'sub';
    const autoPlay = req.query.autoPlay === '1';
    const startSec = Number(req.query.start || 0);
    const refresh = req.query.refresh === '1';

    if (!Number.isInteger(anilistId) || anilistId <= 0) {
      return res.status(400).json({ error: 'Valid positive AniList anime ID is required.' });
    }
    if (!Number.isFinite(episode) || episode < 0) {
      return res.status(400).json({ error: 'Valid non-negative episode number is required.' });
    }

    const [providers, resolved] = await Promise.all([
      getProviders(true),
      resolveEpisodeSources(anilistId, episode, {
        lang,
        provider: providerKey || undefined,
        autoPlay,
        startSec: Number.isFinite(startSec) ? Math.max(0, startSec) : 0,
        refresh,
      }),
    ]);

    if (!resolved.preferredSource) {
      const errorMsg =
        resolved.errors[0]?.message ||
        'All available streaming providers failed for this episode. Retry.';
      return res.status(resolved.errors.every((e) => e.status === 404) ? 404 : 503).json({
        error: errorMsg,
        errors: resolved.errors,
        allFailed: true,
        diagnostics: resolved.diagnostics,
      });
    }

    const selected =
      providers.find((p) => p.key === resolved.preferredSource!.providerKey) || providers[0];
    const backupSource = resolved.sources.find((s) => s.providerKey !== selected.key) || null;
    const backupProvider = backupSource
      ? providers.find((p) => p.key === backupSource.providerKey) || null
      : null;

    res.json({
      provider: selected,
      backupProvider,
      backupEmbedUrl: backupSource?.embedUrl || null,
      availableProviders: providers.filter((p) =>
        resolved.sources.some((s) => s.providerKey === p.key)
      ),
      embedUrl: resolved.preferredSource.embedUrl,
      sources: resolved.sources,
      preferredSource: resolved.preferredSource,
      errors: resolved.errors,
      diagnostics: resolved.diagnostics,
      language: lang,
      idMapping: { anilistId, malId: resolved.malId },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to resolve stream.';
    const status = msg.includes('does not support') ? 422 : 400;
    res.status(status).json({ error: msg });
  }
});

router.post('/telemetry', validateBody(telemetryEventSchema), async (req, res) => {
  try {
    const { event, server, from, to, reason, anilistId, episode, latencyMs } = req.body;
    if (event === 'init_success' && isCoreProviderKey(String(server || ''))) {
      await recordPlaybackSuccess(
        server as 'yenime' | 'aniembed',
        typeof latencyMs === 'number' ? latencyMs : undefined
      );
      return res.json({ ok: true });
    }
    if (event === 'failover' && isCoreProviderKey(String(from || ''))) {
      await recordPlaybackFailover({
        from: String(from),
        to: String(to || 'none'),
        reason: String(reason || 'Primary server unavailable'),
        anilistId: Number(anilistId || 0),
        episode: Number(episode || 1),
      });
      return res.json({ ok: true });
    }
    if (event === 'error' && isCoreProviderKey(String(server || ''))) {
      await recordProviderError(String(server), String(reason || 'Playback error'));
      return res.json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: 'Invalid telemetry event payload.' });
  } catch {
    res.json({ ok: false });
  }
});

router.post('/report-error', async (req, res) => {
  try {
    const { providerKey, error } = req.body || {};
    if (typeof providerKey === 'string' && isCoreProviderKey(providerKey)) {
      await recordProviderError(providerKey, String(error || 'Playback failed in player'));
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

router.get('/hls-proxy', async (req, res) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!token) {
      return res.status(400).json({ error: 'Missing stream proxy token.' });
    }
    const range = typeof req.headers.range === 'string' ? req.headers.range : null;
    const result = await proxyUpstreamMedia(token, range);
    if (!result.ok || result.body === undefined) {
      return res.status(result.status).json({ error: result.error || 'Stream proxy error.' });
    }
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'private, max-age=300');
    if (result.contentRange) {
      res.setHeader('Content-Range', result.contentRange);
    }
    if (result.acceptRanges) {
      res.setHeader('Accept-Ranges', result.acceptRanges);
    }
    return res.status(result.status).send(result.body);
  } catch (err) {
    return res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to proxy stream segment.',
    });
  }
});

export default router;

