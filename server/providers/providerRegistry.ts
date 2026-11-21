import {
  CORE_PROVIDER_KEYS,
  createProviderAdapter,
  resolveAdapterType,
  validateProviderBaseUrl,
  validateProviderUrlTemplate,
} from '../../src/providers/adapters/index.ts';
import type {
  ProviderAvailabilityStatus,
  ProviderDetailedDiagnostics,
  ProviderDiagnosticStageKey,
  ProviderDualHealthState,
  ProviderOperationalStatus,
  ProviderTestResult,
  ProviderTestStages,
  StreamingProvider,
  SupportedIdType,
  UnifiedPlaybackTelemetry,
} from '../../src/types/anime.ts';
import {
  BROWSER_USER_AGENT,
  dedupeInFlight,
  HttpRequestError,
  reliableFetch,
  TIMEOUTS,
} from '../utils/httpClient.ts';
import { getCached, setCached } from '../services/cacheService.ts';
import { dbGet, dbList, dbSet, ensureDefaultSeedData } from '../services/db.ts';

const DEFAULT_TELEMETRY: UnifiedPlaybackTelemetry = {
  currentActiveServer: 'none',
  lastSuccessfulInitAt: null,
  lastSuccessfulServer: null,
  lastConfirmedPlaybackAt: null,
  autoFailoverEnabled: true,
  lastError: null,
  lastFallbackEvent: null,
  failoverCount: 0,
};

export function isCoreProviderKey(
  key: string
): key is 'yenime' | 'aniembed' {
  return (CORE_PROVIDER_KEYS as readonly string[]).includes(key);
}

export function computeProviderDualHealth(raw: {
  key: string;
  name?: string;
  baseUrl?: string;
  urlTemplate?: string;
  isEnabled?: boolean;
  apiReachable?: boolean | null;
  playerInitialized?: boolean | null;
  embeddingAllowed?: boolean | null;
  healthState?: StreamingProvider['healthState'];
  consecutiveFailures?: number;
  diagnostics?: ProviderDetailedDiagnostics;
}): {
  apiHealthState: ProviderDualHealthState;
  playbackHealthState: ProviderDualHealthState;
  operationalStatus: ProviderOperationalStatus;
} {
  const baseUrl = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : '';
  const urlTemplate = typeof raw.urlTemplate === 'string' ? raw.urlTemplate.trim() : '';

  if (!baseUrl || !urlTemplate) {
    return {
      apiHealthState: 'config_error',
      playbackHealthState: 'config_error',
      operationalStatus: 'Configuration error',
    };
  }

  const tplCheck = validateProviderTemplate(urlTemplate, {
    key: raw.key,
    baseUrl,
  });
  if (!tplCheck.valid) {
    return {
      apiHealthState: 'config_error',
      playbackHealthState: 'config_error',
      operationalStatus: 'Configuration error',
    };
  }

  if (!raw.isEnabled) {
    return {
      apiHealthState: 'disabled',
      playbackHealthState: 'disabled',
      operationalStatus: 'Disabled',
    };
  }

  let apiHealthState: ProviderDualHealthState = 'healthy';
  if (raw.diagnostics?.apiHealth === 'unreachable' || raw.apiReachable === false) {
    apiHealthState = 'unavailable';
  } else if (raw.diagnostics?.apiHealth === 'degraded') {
    apiHealthState = 'degraded';
  }

  let playbackHealthState: ProviderDualHealthState = 'healthy';
  if (raw.embeddingAllowed === false || raw.healthState === 'FAILED') {
    playbackHealthState = 'unavailable';
  } else if (raw.healthState === 'DEGRADED' || raw.healthState === 'RECOVERING' || raw.playerInitialized === false) {
    playbackHealthState = 'degraded';
  }

  let operationalStatus: ProviderOperationalStatus = 'Healthy';
  if (apiHealthState === 'unavailable' || playbackHealthState === 'unavailable') {
    operationalStatus = 'Temporarily unavailable';
  } else if (apiHealthState === 'degraded' || playbackHealthState === 'degraded') {
    operationalStatus = 'Degraded';
  }

  return { apiHealthState, playbackHealthState, operationalStatus };
}

export function normalizeProviderRecord(raw: StreamingProvider): StreamingProvider {
  const adapterType = resolveAdapterType(raw.key, raw.adapterType);
  const baseUrl = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : '';
  const urlTemplate = typeof raw.urlTemplate === 'string' ? raw.urlTemplate.trim() : '';
  const supportedIdTypes: SupportedIdType[] =
    adapterType === 'yenime' ? ['mal', 'anilist'] : ['anilist'];

  const licenseVerified = Boolean(raw.licenseVerified);
  const embeddingAllowed = raw.embeddingAllowed !== undefined ? raw.embeddingAllowed : null;
  const apiReachable = raw.apiReachable !== undefined ? raw.apiReachable : null;
  const playerInitialized = raw.playerInitialized !== undefined ? raw.playerInitialized : null;
  const consecutiveFailures = Number.isFinite(raw.consecutiveFailures)
    ? Math.max(0, Number(raw.consecutiveFailures))
    : 0;
  const averageResponseTimeMs = Number.isFinite(raw.averageResponseTimeMs)
    ? Math.max(0, Math.round(Number(raw.averageResponseTimeMs)))
    : null;
  const cooldownUntil = raw.cooldownUntil ?? null;

  let availabilityStatus: ProviderAvailabilityStatus = raw.availabilityStatus || 'unverified';
  if (!urlTemplate || !baseUrl) {
    availabilityStatus = 'unconfigured';
  } else if (embeddingAllowed === false) {
    availabilityStatus = 'restricted';
  } else if (!licenseVerified && availabilityStatus === 'available') {
    availabilityStatus = 'unverified';
  }

  const priority = Number.isFinite(raw.priority)
    ? Number(raw.priority)
    : adapterType === 'yenime'
      ? 1
      : 2;

  const defaultLangs = ['sub', 'dub'];
  const rawLangs = Array.isArray(raw.supportedLanguages)
    ? raw.supportedLanguages.filter((l) => l === 'sub' || l === 'dub')
    : [];

  const dualHealth = computeProviderDualHealth({
    key: adapterType,
    name: raw.name,
    baseUrl,
    urlTemplate,
    isEnabled: Boolean(raw.isEnabled),
    apiReachable,
    playerInitialized,
    embeddingAllowed,
    healthState: raw.healthState || 'READY',
    consecutiveFailures,
    diagnostics: raw.diagnostics,
  });

  return {
    ...raw,
    id: adapterType,
    key: adapterType,
    role: priority <= 1 ? raw.role || 'primary' : raw.role || 'backup',
    adapterType,
    baseUrl,
    urlTemplate,
    supportedIdTypes,
    supportedLanguages: rawLangs.length > 0 ? rawLangs : defaultLangs,
    supportedFormats: adapterType === 'yenime' ? ['hls', 'embed'] : ['embed'],
    isEnabled: Boolean(raw.isEnabled),
    licenseVerified,
    embeddingAllowed,
    apiReachable,
    playerInitialized,
    healthState: raw.healthState || 'READY',
    apiHealthState: dualHealth.apiHealthState,
    playbackHealthState: dualHealth.playbackHealthState,
    operationalStatus: dualHealth.operationalStatus,
    consecutiveFailures,
    averageResponseTimeMs,
    cooldownUntil,
    diagnostics: {
      ...(raw.diagnostics || {
        apiHealth:
          apiReachable === true ? 'healthy' : apiReachable === false ? 'unreachable' : 'untested',
        searchLatencyMs: null,
        episodeDiscoveryStatus: 'untested',
        streamResolutionStatus: 'untested',
        subtitleAvailability: 'none',
        lastTestedAt: raw.lastCheckedAt ?? null,
      }),
      apiHealthState: dualHealth.apiHealthState,
      playbackHealthState: dualHealth.playbackHealthState,
      operationalStatus: dualHealth.operationalStatus,
    },
    availabilityStatus,
    verificationNotes: raw.verificationNotes ?? null,
    verifiedAt: raw.verifiedAt ?? null,
    lastHttpStatus: raw.lastHttpStatus ?? null,
    lastSuccessAt: raw.lastSuccessAt ?? null,
    priority,
    errorCount: Number.isFinite(raw.errorCount) ? Number(raw.errorCount) : 0,
    lastError: raw.lastError ?? null,
    lastCheckedAt: raw.lastCheckedAt ?? null,
  };
}

export function validateProviderTemplate(
  template: string,
  options: { key: string; baseUrl?: string; skipBaseCheck?: boolean }
): { valid: boolean; stage?: 'url_syntax' | 'hostname'; error?: string } {
  const key = options.key.trim().toLowerCase();
  if (key === 'yenime') {
    return validateProviderUrlTemplate(template, {
      providerName: 'Yenime',
      requiredHostname: 'player.yenime.net',
      requiredPlaceholders: ['{ANILIST_ID}', '{EPISODE}'],
      forbiddenPlaceholders: ['{LANG}', '{AUTOPLAY}', '{START}'],
      baseUrl: options.skipBaseCheck ? undefined : options.baseUrl,
      requiredBaseHostname: options.skipBaseCheck ? undefined : 'api.yenime.net',
    });
  }
  if (key === 'aniembed') {
    return validateProviderUrlTemplate(template, {
      providerName: 'AniEmbed',
      requiredHostname: 'aniembed.se',
      requiredPlaceholders: ['{ANILIST_ID}', '{EPISODE}', '{LANG}', '{AUTOPLAY}', '{START}'],
      baseUrl: options.skipBaseCheck ? undefined : options.baseUrl,
      requiredBaseHostname: options.skipBaseCheck ? undefined : 'aniembed.se',
    });
  }
  return {
    valid: false,
    stage: 'url_syntax',
    error: `Unsupported provider key "${key}". Only Yenime and AniEmbed are allowed.`,
  };
}

export function isProviderActivated(provider: StreamingProvider): boolean {
  if (!isCoreProviderKey(provider.key)) return false;
  const normalized = normalizeProviderRecord(provider);
  const adapter = createProviderAdapter(normalized);
  return adapter.isActivated() && adapter.validateConfiguration().valid;
}

export function buildProviderEmbedUrl(
  provider: StreamingProvider,
  params: {
    anilistId: number;
    malId?: number | null;
    episode: number;
    language?: 'sub' | 'dub';
    slug?: string;
    autoPlay?: boolean;
    startSec?: number;
  }
): string {
  const normalized = normalizeProviderRecord(provider);
  const adapter = createProviderAdapter(normalized);
  const result = adapter.buildEmbedUrl({
    anilistId: params.anilistId,
    malId: params.malId ?? null,
    episode: params.episode,
    track: params.language || 'sub',
    slug: params.slug,
    autoPlay: Boolean(params.autoPlay),
    startSeconds: Math.max(0, Math.floor(params.startSec || 0)),
  });

  if (!result.valid || !result.url) {
    throw new Error(result.error || `${normalized.name} could not build an embed URL.`);
  }
  return result.url;
}

export async function getProviders(includeUnactivated = false): Promise<StreamingProvider[]> {
  await ensureDefaultSeedData();
  const list = await dbList<StreamingProvider>('anime_providers');
  const nowMs = Date.now();
  const normalized = list
    .filter((p) => isCoreProviderKey(p.key))
    .map(normalizeProviderRecord);

  return normalized
    .filter((p) => {
      if (includeUnactivated) return true;
      if (!isProviderActivated(p)) return false;
      // Skip providers temporarily in failure cooldown unless no other provider is healthy
      if (p.cooldownUntil && Date.parse(p.cooldownUntil) > nowMs && p.healthState === 'FAILED') {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Healthy / ACTIVE / READY come before DEGRADED / RECOVERING
      const scoreHealth = (p: StreamingProvider) => {
        if (p.healthState === 'FAILED') return 3;
        if (p.healthState === 'DEGRADED') return 2;
        if (p.healthState === 'RECOVERING') return 1;
        return 0;
      };
      const diff = scoreHealth(a) - scoreHealth(b);
      if (diff !== 0) return diff;
      // Prefer fastest healthy if primary has high latency (>2500ms) while backup is fast (<800ms)
      const latA = a.averageResponseTimeMs ?? 500;
      const latB = b.averageResponseTimeMs ?? 500;
      if (Math.abs(latA - latB) > 1500) {
        return latA - latB;
      }
      return a.priority - b.priority;
    });
}

export async function getPlaybackTelemetry(): Promise<UnifiedPlaybackTelemetry> {
  await ensureDefaultSeedData();
  const doc = await dbGet<UnifiedPlaybackTelemetry>('playback_telemetry', 'unified');
  return { ...DEFAULT_TELEMETRY, ...(doc || {}) };
}

export async function recordPlaybackSuccess(
  server: 'yenime' | 'aniembed',
  latencyMs?: number,
  diagnosticsPatch?: Partial<ProviderDetailedDiagnostics>
): Promise<void> {
  const now = new Date().toISOString();
  const current = await getPlaybackTelemetry();
  await dbSet('playback_telemetry', 'unified', {
    ...current,
    currentActiveServer: server,
    lastSuccessfulInitAt: now,
    lastConfirmedPlaybackAt: now,
    lastSuccessfulServer: server,
  });

  const provider = await dbGet<StreamingProvider>('anime_providers', server);
  if (provider) {
    const prevAvg = provider.averageResponseTimeMs;
    const nextAvg =
      typeof latencyMs === 'number' && latencyMs > 0
        ? prevAvg
          ? Math.round(prevAvg * 0.7 + latencyMs * 0.3)
          : Math.round(latencyMs)
        : prevAvg ?? null;
    await dbSet('anime_providers', server, {
      ...provider,
      isEnabled: true,
      apiReachable: true,
      playerInitialized: true,
      healthState: 'ACTIVE',
      consecutiveFailures: 0,
      cooldownUntil: null,
      averageResponseTimeMs: nextAvg,
      diagnostics: {
        ...(provider.diagnostics || {}),
        apiHealth: 'healthy',
        lastTestedAt: now,
        ...(diagnosticsPatch || {}),
      },
      availabilityStatus: 'available',
      lastSuccessAt: now,
      lastCheckedAt: now,
      lastError: null,
    });
  }
}

export async function recordAdminIframeStatus(
  server: 'yenime' | 'aniembed',
  initialized: boolean,
  error?: string | null
): Promise<void> {
  const now = new Date().toISOString();
  const provider = await dbGet<StreamingProvider>('anime_providers', server);
  if (!provider) return;
  await dbSet('anime_providers', server, {
    ...provider,
    playerInitialized: initialized,
    lastCheckedAt: now,
    lastError: initialized ? null : error ? error.slice(0, 300) : 'Player initialization failed',
  });
}

export async function recordPlaybackFailover(params: {
  from: string;
  to: string;
  reason: string;
  anilistId: number;
  episode: number;
}): Promise<void> {
  const now = new Date().toISOString();
  const current = await getPlaybackTelemetry();
  const nextActive: 'yenime' | 'aniembed' | 'none' =
    isCoreProviderKey(params.to) ? params.to : 'none';

  await dbSet('playback_telemetry', 'unified', {
    ...current,
    currentActiveServer: nextActive,
    failoverCount: (current.failoverCount || 0) + 1,
    lastError: {
      server: params.from,
      message: params.reason.slice(0, 300),
      at: now,
    },
    lastFallbackEvent: {
      from: params.from,
      to: params.to,
      reason: params.reason.slice(0, 300),
      anilistId: params.anilistId,
      episode: params.episode,
      at: now,
    },
  });

  await recordProviderError(params.from, params.reason, false);
}

export async function recordProviderError(
  providerKey: string,
  errorMsg: string,
  updateTelemetry = true
): Promise<void> {
  if (!isCoreProviderKey(providerKey)) return;
  const now = new Date().toISOString();
  const provider = await dbGet<StreamingProvider>('anime_providers', providerKey);
  if (provider) {
    const nextFailures = (provider.consecutiveFailures || 0) + 1;
    const isFailed = nextFailures >= 2;
    await dbSet('anime_providers', providerKey, {
      ...provider,
      errorCount: (provider.errorCount || 0) + 1,
      consecutiveFailures: nextFailures,
      healthState: isFailed ? 'FAILED' : 'DEGRADED',
      cooldownUntil: isFailed ? new Date(Date.now() + 90_000).toISOString() : provider.cooldownUntil ?? null,
      lastError: errorMsg.slice(0, 300),
      lastCheckedAt: now,
    });
  }
  if (updateTelemetry) {
    const current = await getPlaybackTelemetry();
    await dbSet('playback_telemetry', 'unified', {
      ...current,
      lastError: {
        server: providerKey,
        message: errorMsg.slice(0, 300),
        at: now,
      },
    });
  }
}

function parseFrameAncestors(cspHeader: string | null): string | null {
  if (!cspHeader) return null;
  const directives = cspHeader.split(';').map((d) => d.trim());
  const match = directives.find((d) => d.toLowerCase().startsWith('frame-ancestors'));
  return match || null;
}

function evaluateEmbeddingHeaders(
  xFrameOptions: string | null,
  cspHeader: string | null
): { allowed: boolean; frameAncestors: string | null; reason: string | null } {
  const frameAncestors = parseFrameAncestors(cspHeader);

  if (xFrameOptions) {
    const xfo = xFrameOptions.trim().toUpperCase();
    if (xfo === 'DENY' || xfo === 'SAMEORIGIN') {
      return {
        allowed: false,
        frameAncestors,
        reason: `Upstream restricts framing via X-Frame-Options: ${xfo}.`,
      };
    }
  }

  if (frameAncestors) {
    const val = frameAncestors.replace(/^frame-ancestors\s+/i, '').trim().toLowerCase();
    if (val === "'none'" || val === "'self'") {
      return {
        allowed: false,
        frameAncestors,
        reason: `Upstream restricts framing via CSP (${frameAncestors}).`,
      };
    }
  }

  return { allowed: true, frameAncestors, reason: null };
}

function buildEmptyStages(): ProviderTestStages {
  return {
    urlSyntax: { passed: false, message: 'Not evaluated' },
    hostname: { passed: false, message: 'Not evaluated' },
    apiConnectivity: { passed: null, status: 0, latencyMs: 0, message: 'Not run' },
    playerUrlGeneration: { passed: null, url: null, message: 'Not run' },
    iframeInitialization: {
      passed: null,
      status: 0,
      xFrameOptions: null,
      frameAncestors: null,
      message: 'Not run',
    },
  };
}

async function runApiHealthCheck(
  key: 'yenime' | 'aniembed',
  baseUrl: string,
  sampleEmbedUrl: string,
  sampleAnilistId = 16498,
  sampleEpisode = 1
): Promise<{
  passed: boolean;
  status: number;
  latencyMs: number;
  message: string;
  diagnostics?: ProviderDetailedDiagnostics;
}> {
  const startMs = Date.now();
  const nowIso = new Date().toISOString();

  if (key === 'yenime') {
    try {
      const [rootRes, sourceRes] = await Promise.all([
        reliableFetch(baseUrl, {
          method: 'GET',
          redirect: 'follow',
          timeoutMs: TIMEOUTS.PROVIDER_HEALTH_MS,
          maxAttempts: 2,
          headers: {
            Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
            'User-Agent': BROWSER_USER_AGENT,
          },
        }),
        reliableFetch(
          `${baseUrl.replace(/\/$/, '')}/megaplay?ani=${sampleAnilistId}&ep=${sampleEpisode}&type=sub`,
          {
            method: 'GET',
            redirect: 'follow',
            timeoutMs: TIMEOUTS.PROVIDER_HEALTH_MS,
            maxAttempts: 2,
            headers: {
              Accept: 'application/json',
              'User-Agent': BROWSER_USER_AGENT,
            },
          }
        ),
      ]);
      const latencyMs = Date.now() - startMs;

      const rootJson = await rootRes.json().catch(() => null);
      const sourceJson = await sourceRes.json().catch(() => null);
      const rootOk = rootRes.ok && rootJson && typeof rootJson === 'object';
      const sourceOk =
        sourceRes.ok &&
        sourceJson &&
        typeof sourceJson === 'object' &&
        Boolean(sourceJson.m3u8 || sourceJson.embedUrl);

      if (rootOk && sourceOk) {
        const routeCount = Array.isArray(rootJson.routes) ? rootJson.routes.length : null;
        return {
          passed: true,
          status: sourceRes.status,
          latencyMs,
          message: `Yenime API & source extraction verified (${routeCount ?? '?'} routes · m3u8/embed OK · ${latencyMs}ms)`,
          diagnostics: {
            apiHealth: 'healthy',
            searchLatencyMs: latencyMs,
            episodeDiscoveryStatus: 'ok',
            streamResolutionStatus: 'ok',
            subtitleAvailability: Array.isArray(sourceJson?.tracks) && sourceJson.tracks.length > 0 ? 'vtt' : 'none',
            lastTestedAt: nowIso,
          },
        };
      }

      return {
        passed: false,
        status: !rootOk ? rootRes.status : sourceRes.status,
        latencyMs,
        message: !rootOk
          ? `Yenime API root check failed (HTTP ${rootRes.status}).`
          : `Yenime API reachable, but episode source verification failed (HTTP ${sourceRes.status}).`,
        diagnostics: {
          apiHealth: rootOk ? 'degraded' : 'unreachable',
          searchLatencyMs: latencyMs,
          episodeDiscoveryStatus: rootOk ? 'partial' : 'failed',
          streamResolutionStatus: 'failed',
          subtitleAvailability: 'unknown',
          lastTestedAt: nowIso,
        },
      };
    } catch (err) {
      const latencyMs = Date.now() - startMs;
      return {
        passed: false,
        status: 0,
        latencyMs,
        message: `Yenime API unreachable: ${err instanceof Error ? err.message : 'Network request failed'}`,
        diagnostics: {
          apiHealth: 'unreachable',
          searchLatencyMs: latencyMs,
          episodeDiscoveryStatus: 'failed',
          streamResolutionStatus: 'failed',
          subtitleAvailability: 'unknown',
          lastTestedAt: nowIso,
        },
      };
    }
  }

  // AniEmbed: verify embed endpoint serves real HTML app (non-empty) and HTTP < 400
  try {
    const res = await reliableFetch(sampleEmbedUrl, {
      method: 'GET',
      redirect: 'follow',
      timeoutMs: TIMEOUTS.PROVIDER_HEALTH_MS,
      maxAttempts: 2,
      headers: {
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'User-Agent': BROWSER_USER_AGENT,
      },
    });
    const bodyText = await res.text().catch(() => '');
    const latencyMs = Date.now() - startMs;
    const hasHtmlShell = bodyText.includes('<html') || bodyText.includes('<!doctype html');
    const passed = res.status >= 200 && res.status < 400 && hasHtmlShell;

    return {
      passed,
      status: res.status,
      latencyMs,
      message: passed
        ? `AniEmbed embed endpoint verified (HTTP ${res.status} · HTML player shell · ${latencyMs}ms)`
        : `AniEmbed embed endpoint returned HTTP ${res.status} (${latencyMs}ms).`,
      diagnostics: {
        apiHealth: passed ? 'healthy' : 'unreachable',
        searchLatencyMs: latencyMs,
        episodeDiscoveryStatus: passed ? 'ok' : 'failed',
        streamResolutionStatus: passed ? 'ok' : 'failed',
        subtitleAvailability: 'none',
        lastTestedAt: nowIso,
      },
    };
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    return {
      passed: false,
      status: 0,
      latencyMs,
      message: `AniEmbed endpoint unreachable: ${err instanceof Error ? err.message : 'Network request failed'}`,
      diagnostics: {
        apiHealth: 'unreachable',
        searchLatencyMs: latencyMs,
        episodeDiscoveryStatus: 'failed',
        streamResolutionStatus: 'failed',
        subtitleAvailability: 'none',
        lastTestedAt: nowIso,
      },
    };
  }
}

async function runIframeEndpointProbe(embedUrl: string): Promise<{
  passed: boolean;
  status: number;
  latencyMs: number;
  xFrameOptions: string | null;
  frameAncestors: string | null;
  embeddingAllowed: boolean;
  message: string;
}> {
  const startMs = Date.now();
  try {
    const res = await reliableFetch(embedUrl, {
      method: 'GET',
      redirect: 'follow',
      timeoutMs: TIMEOUTS.PROVIDER_HEALTH_MS,
      maxAttempts: 2,
      headers: {
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'User-Agent': BROWSER_USER_AGENT,
      },
    });
    try {
      await res.body?.cancel();
    } catch {
      // ignore cancel errors
    }

    const latencyMs = Date.now() - startMs;
    const xFrameOptions = res.headers.get('x-frame-options');
    const cspHeader = res.headers.get('content-security-policy');
    const policy = evaluateEmbeddingHeaders(xFrameOptions, cspHeader);
    const reachable = res.status >= 200 && res.status < 400;
    const passed = reachable && policy.allowed;

    return {
      passed,
      status: res.status,
      latencyMs,
      xFrameOptions,
      frameAncestors: policy.frameAncestors,
      embeddingAllowed: policy.allowed,
      message: !reachable
        ? `Embed iframe URL returned HTTP ${res.status} (${latencyMs}ms).`
        : !policy.allowed
          ? policy.reason || 'Embed iframe framing blocked by upstream headers.'
          : `Endpoint reachable (HTTP ${res.status} · ${latencyMs}ms${policy.frameAncestors ? ` · ${policy.frameAncestors}` : ''}).`,
    };
  } catch (err) {
    const latencyMs = Date.now() - startMs;
    return {
      passed: false,
      status: 0,
      latencyMs,
      xFrameOptions: null,
      frameAncestors: null,
      embeddingAllowed: false,
      message: `Endpoint unreachable: ${err instanceof Error ? err.message : 'Connection failed'}`,
    };
  }
}

export async function testProviderAdapter(
  providerInput: Partial<StreamingProvider> & { urlTemplate?: string; key?: string; name?: string },
  options?: {
    anilistId?: number;
    episode?: number;
    track?: 'sub' | 'dub';
    autoPlay?: boolean;
    startSec?: number;
    persist?: boolean;
    mode?: 'url' | 'probe';
    force?: boolean;
  }
): Promise<ProviderTestResult> {
  const key = (providerInput.key || '').trim().toLowerCase();
  const name =
    providerInput.name || (key === 'aniembed' ? 'AniEmbed' : 'Yenime');
  const rawBaseUrl = providerInput.baseUrl;
  const rawTemplate = providerInput.urlTemplate;
  const testAnilistId = Number(options?.anilistId || 16498);
  const testEpisode = Number(options?.episode || 1);
  const testTrack = options?.track === 'dub' ? 'dub' : 'sub';
  const mode = options?.mode === 'url' ? 'url' : 'probe';
  const testedAt = new Date().toISOString();

  const stages = buildEmptyStages();

  if (!isCoreProviderKey(key)) {
    const err = `Unsupported provider "${key}". Only Yenime and AniEmbed exist in the unified system.`;
    stages.urlSyntax = { passed: false, message: err };
    return {
      providerKey: key || 'unknown',
      providerName: name,
      configured: false,
      urlValid: false,
      hostnameValid: false,
      apiReachable: false,
      reachable: false,
      embeddingAllowed: false,
      playerInitialized: null,
      availabilityStatus: 'error',
      status: 0,
      latencyMs: 0,
      resolvedUrl: null,
      xFrameOptions: null,
      frameAncestors: null,
      failedStage: 'url_syntax',
      error: err,
      testedAt,
      stages,
    };
  }

  const expectedBaseHost =
    key === 'yenime' ? 'api.yenime.net' : 'aniembed.se';
  const expectedTplHost =
    key === 'yenime' ? 'player.yenime.net' : 'aniembed.se';
  const requiredPlaceholders =
    key === 'yenime'
      ? ['{ANILIST_ID}', '{EPISODE}']
      : ['{ANILIST_ID}', '{EPISODE}', '{LANG}', '{AUTOPLAY}', '{START}'];
  const forbiddenPlaceholders =
    key === 'yenime' ? ['{LANG}', '{AUTOPLAY}', '{START}'] : undefined;

  // Stage A & Stage B for Base URL
  const baseCheck = validateProviderBaseUrl(rawBaseUrl, {
    requiredBaseHostname: expectedBaseHost,
    providerName: name,
  });

  // Stage A & Stage B for Player URL Template
  const tplCheck = validateProviderUrlTemplate(rawTemplate, {
    providerName: name,
    requiredHostname: expectedTplHost,
    requiredPlaceholders,
    forbiddenPlaceholders,
  });

  // Stage A: URL Syntax Check (syntax errors across baseUrl & urlTemplate)
  if (!baseCheck.valid && baseCheck.stage === 'url_syntax') {
    stages.urlSyntax = { passed: false, message: baseCheck.error || 'Invalid Base URL syntax.' };
    return {
      providerKey: key,
      providerName: name,
      configured: Boolean(String(rawBaseUrl || '').trim() || String(rawTemplate || '').trim()),
      urlValid: false,
      hostnameValid: false,
      apiReachable: false,
      reachable: false,
      embeddingAllowed: false,
      playerInitialized: null,
      availabilityStatus: 'error',
      status: 0,
      latencyMs: 0,
      resolvedUrl: null,
      xFrameOptions: null,
      frameAncestors: null,
      failedStage: 'url_syntax',
      error: baseCheck.error || 'Invalid Base URL syntax.',
      testedAt,
      stages,
    };
  }

  if (!tplCheck.valid && tplCheck.stage === 'url_syntax') {
    stages.urlSyntax = { passed: false, message: tplCheck.error || 'Invalid Player Template syntax.' };
    return {
      providerKey: key,
      providerName: name,
      configured: Boolean(String(rawBaseUrl || '').trim() || String(rawTemplate || '').trim()),
      urlValid: false,
      hostnameValid: false,
      apiReachable: false,
      reachable: false,
      embeddingAllowed: false,
      playerInitialized: null,
      availabilityStatus: !String(rawTemplate || '').trim() ? 'unconfigured' : 'error',
      status: 0,
      latencyMs: 0,
      resolvedUrl: null,
      xFrameOptions: null,
      frameAncestors: null,
      failedStage: 'url_syntax',
      error: tplCheck.error || 'Invalid Player Template syntax.',
      testedAt,
      stages,
    };
  }

  stages.urlSyntax = {
    passed: true,
    message: `HTTPS syntax valid for both Base URL and Player URL Template.`,
  };

  // Stage B: Provider Hostname Validation
  if (!baseCheck.valid && baseCheck.stage === 'hostname') {
    stages.hostname = { passed: false, message: baseCheck.error || 'Invalid Base URL hostname.' };
    return {
      providerKey: key,
      providerName: name,
      configured: true,
      urlValid: true,
      hostnameValid: false,
      apiReachable: false,
      reachable: false,
      embeddingAllowed: false,
      playerInitialized: null,
      availabilityStatus: 'error',
      status: 0,
      latencyMs: 0,
      resolvedUrl: null,
      xFrameOptions: null,
      frameAncestors: null,
      failedStage: 'hostname',
      error: baseCheck.error || 'Invalid Base URL hostname.',
      testedAt,
      stages,
    };
  }

  if (!tplCheck.valid && tplCheck.stage === 'hostname') {
    stages.hostname = { passed: false, message: tplCheck.error || 'Invalid Player URL hostname.' };
    return {
      providerKey: key,
      providerName: name,
      configured: true,
      urlValid: true,
      hostnameValid: false,
      apiReachable: false,
      reachable: false,
      embeddingAllowed: false,
      playerInitialized: null,
      availabilityStatus: 'error',
      status: 0,
      latencyMs: 0,
      resolvedUrl: null,
      xFrameOptions: null,
      frameAncestors: null,
      failedStage: 'hostname',
      error: tplCheck.error || 'Invalid Player URL hostname.',
      testedAt,
      stages,
    };
  }

  stages.hostname = {
    passed: true,
    message: `Allowed hostnames verified (${expectedBaseHost} / ${expectedTplHost}).`,
  };

  // Stage D (computed cleanly now so both URL-mode and Probe-mode can validate parameter replacement)
  const normalized = normalizeProviderRecord({
    id: key,
    key,
    name,
    adapterType: key,
    baseUrl: baseCheck.normalized,
    urlTemplate: String(rawTemplate).trim(),
    supportedIdTypes: ['anilist'],
    supportedLanguages: providerInput.supportedLanguages || ['sub', 'dub'],
    isEnabled: true,
    licenseVerified: true,
    embeddingAllowed: true,
    availabilityStatus: 'unverified',
    priority: providerInput.priority ?? (key === 'yenime' ? 1 : 2),
    errorCount: providerInput.errorCount ?? 0,
  });

  const adapter = createProviderAdapter(normalized);
  const buildResult = adapter.buildEmbedUrl({
    anilistId: testAnilistId,
    episode: testEpisode,
    track: testTrack,
    autoPlay: Boolean(options?.autoPlay),
    startSeconds: Math.max(0, Math.floor(options?.startSec || 0)),
  });

  if (!buildResult.valid || !buildResult.url) {
    const genError = buildResult.error || 'Could not generate episode player URL.';
    stages.playerUrlGeneration = { passed: false, url: null, message: genError };
    return {
      providerKey: key,
      providerName: name,
      configured: true,
      urlValid: true,
      hostnameValid: true,
      apiReachable: false,
      reachable: false,
      embeddingAllowed: false,
      playerInitialized: null,
      availabilityStatus: 'error',
      status: 0,
      latencyMs: 0,
      resolvedUrl: null,
      xFrameOptions: null,
      frameAncestors: null,
      failedStage: 'url_generation',
      error: genError,
      testedAt,
      stages,
    };
  }

  const resolvedUrl = buildResult.url;
  stages.playerUrlGeneration = {
    passed: true,
    url: resolvedUrl,
    message: `Generated valid HTTPS player URL for AniList #${testAnilistId} Ep ${testEpisode}.`,
  };

  if (mode === 'url') {
    stages.apiConnectivity = {
      passed: null,
      status: 0,
      latencyMs: 0,
      message: 'Skipped in URL-only check (click Test Iframe Init / Run Live Test to test live connectivity).',
    };
    stages.iframeInitialization = {
      passed: null,
      status: 0,
      xFrameOptions: null,
      frameAncestors: null,
      message: 'Skipped in URL-only check.',
    };
    return {
      providerKey: key,
      providerName: name,
      configured: true,
      urlValid: true,
      hostnameValid: true,
      apiReachable: Boolean(providerInput.apiReachable),
      reachable: true,
      embeddingAllowed: providerInput.embeddingAllowed !== false,
      playerInitialized: providerInput.playerInitialized ?? null,
      availabilityStatus: 'CONFIGURED',
      status: 0,
      latencyMs: 0,
      resolvedUrl,
      xFrameOptions: null,
      frameAncestors: null,
      failedStage: null,
      error: null,
      testedAt,
      stages,
    };
  }

  const probeCacheKey = `provider:probe:v3:${key}:${baseCheck.normalized}:${resolvedUrl}`;
  if (!options?.force) {
    const cachedProbe = getCached<ProviderTestResult>(probeCacheKey);
    if (cachedProbe) {
      return cachedProbe;
    }
  }

  // Stage C (API / HLS / VTT Connectivity) + Stage E (Endpoint Framing / Reachability)
  const [apiCheck, iframeCheck] = await Promise.all([
    runApiHealthCheck(key, baseCheck.normalized, resolvedUrl, testAnilistId, testEpisode),
    runIframeEndpointProbe(resolvedUrl),
  ]);

  stages.apiConnectivity = {
    passed: apiCheck.passed,
    status: apiCheck.status,
    latencyMs: apiCheck.latencyMs,
    message: apiCheck.message,
  };

  stages.iframeInitialization = {
    passed: iframeCheck.passed,
    status: iframeCheck.status,
    xFrameOptions: iframeCheck.xFrameOptions,
    frameAncestors: iframeCheck.frameAncestors,
    message: iframeCheck.message,
  };

  let failedStage: ProviderDiagnosticStageKey | null = null;
  let error: string | null = null;
  let availabilityStatus: ProviderAvailabilityStatus = 'available';

  if (!apiCheck.passed) {
    failedStage = 'api_connectivity';
    error = apiCheck.message;
    availabilityStatus = 'unreachable';
  } else if (!iframeCheck.embeddingAllowed) {
    failedStage = 'iframe_init';
    error = iframeCheck.message;
    availabilityStatus = 'restricted';
  } else if (!iframeCheck.passed) {
    failedStage = 'iframe_init';
    error = iframeCheck.message;
    availabilityStatus = 'unreachable';
  } else if (!providerInput.licenseVerified) {
    availabilityStatus = 'unverified';
  }

  const overallStatus = iframeCheck.status || apiCheck.status || 0;
  const overallLatency = Math.max(apiCheck.latencyMs, iframeCheck.latencyMs);

  const result: ProviderTestResult = {
    providerKey: key,
    providerName: name,
    configured: true,
    urlValid: true,
    hostnameValid: true,
    apiReachable: apiCheck.passed,
    reachable: apiCheck.passed && iframeCheck.status >= 200 && iframeCheck.status < 400,
    embeddingAllowed: iframeCheck.embeddingAllowed,
    playerInitialized: iframeCheck.passed && apiCheck.passed ? true : false,
    availabilityStatus,
    status: overallStatus,
    latencyMs: overallLatency,
    resolvedUrl,
    xFrameOptions: iframeCheck.xFrameOptions,
    frameAncestors: iframeCheck.frameAncestors,
    failedStage,
    error,
    testedAt,
    stages,
  };

  setCached(probeCacheKey, result, 30);

  if (options?.persist) {
    const existing = await dbGet<StreamingProvider>('anime_providers', key);
    if (existing) {
      const healthy = apiCheck.passed && iframeCheck.passed && iframeCheck.embeddingAllowed;
      const nextFailures = healthy ? 0 : (existing.consecutiveFailures || 0) + 1;
      const nextStatus: ProviderAvailabilityStatus = !apiCheck.passed || !iframeCheck.passed
        ? !iframeCheck.embeddingAllowed
          ? 'restricted'
          : 'unreachable'
        : healthy || existing.licenseVerified
          ? 'available'
          : 'unverified';
      const nextHealthState = !healthy
        ? nextFailures >= 2
          ? 'FAILED'
          : 'DEGRADED'
        : existing.healthState === 'FAILED' || existing.healthState === 'DEGRADED'
          ? 'RECOVERING'
          : existing.playerInitialized
            ? 'ACTIVE'
            : 'READY';
      const prevAvg = existing.averageResponseTimeMs;
      const nextAvg = prevAvg
        ? Math.round(prevAvg * 0.7 + overallLatency * 0.3)
        : Math.round(overallLatency);

      await dbSet('anime_providers', key, {
        ...existing,
        apiReachable: apiCheck.passed,
        playerInitialized: healthy ? true : existing.playerInitialized,
        embeddingAllowed: iframeCheck.embeddingAllowed,
        availabilityStatus: nextStatus,
        healthState: nextHealthState,
        consecutiveFailures: nextFailures,
        averageResponseTimeMs: healthy ? nextAvg : prevAvg ?? overallLatency,
        diagnostics: apiCheck.diagnostics || existing.diagnostics,
        cooldownUntil:
          !healthy && nextFailures >= 2
            ? new Date(Date.now() + 90_000).toISOString()
            : healthy
              ? null
              : existing.cooldownUntil ?? null,
        lastHttpStatus: overallStatus,
        lastCheckedAt: testedAt,
        lastSuccessAt: healthy ? testedAt : existing.lastSuccessAt ?? null,
        lastError: error,
        licenseVerified: healthy ? true : existing.licenseVerified,
        isEnabled: existing.isEnabled,
      });
    }
  }

  return result;
}
