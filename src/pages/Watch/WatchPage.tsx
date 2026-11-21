import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Bookmark, Check, Info, Loader2, Server, WifiOff, X } from 'lucide-react';
import type {
  AnimeDetail,
  DiagnosticReport,
  EpisodeDiscoveryResult,
  MalAnimeInfo,
  ResolvedEpisodeSource,
  StreamingProvider,
} from '../../types/anime.ts';
import type { PlaybackProvider, PlaybackTrack } from '../../providers/types.ts';
import { buildPlaybackProviders } from '../../providers/playbackRegistry.ts';
import { ApiError } from '../../services/apiClient.ts';
import { anilistService } from '../../services/anilistService.ts';
import {
  streamingService,
  type ProviderRegistrySummary,
} from '../../services/streamingService.ts';
import { getPrimaryTitle, parseAnimeIdFromSlug } from '../../utils/slug.ts';
import {
  formatFormat,
  formatMalScore,
  formatScore,
  formatSeason,
  stripHtml,
} from '../../utils/formatters.ts';
import { useLibrary } from '../../context/LibraryContext.tsx';
import { useDocumentMeta } from '../../hooks/useDocumentMeta.ts';
import { Player, type StreamProviderOption } from '../../components/player/Player.tsx';
import { EpisodeSelector } from '../../components/player/EpisodeSelector.tsx';
import { AnimeCard } from '../../components/anime/AnimeCard.tsx';
import { DetailSkeleton } from '../../components/common/Skeletons.tsx';

function getStoredAutoPlay(): boolean {
  try {
    return localStorage.getItem('aniverve-autoplay') === '1';
  } catch {
    return false;
  }
}

function getStoredPreferredProvider(): string | null {
  try {
    const val = localStorage.getItem('aniverve-stream-provider')?.trim().toLowerCase();
    return val === 'yenime' || val === 'aniembed' ? val : null;
  } catch {
    return null;
  }
}

function applyStartPositionToUrl(rawUrl: string | null, startSec: number): string | null {
  if (!rawUrl || startSec <= 0) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.searchParams.has('t')) {
      parsed.searchParams.set('t', String(Math.floor(startSec)));
      return parsed.toString();
    }
    if (parsed.searchParams.has('start')) {
      parsed.searchParams.set('start', String(Math.floor(startSec)));
      return parsed.toString();
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

export function WatchPage() {
  const { slug, episode } = useParams<{ slug: string; episode: string }>();
  const navigate = useNavigate();

  const anilistId = parseAnimeIdFromSlug(slug || '');
  const rawEpisodeNumber = episode === undefined ? 1 : Number(episode);
  const isValidEpisode = Number.isFinite(rawEpisodeNumber) && rawEpisodeNumber >= 0;
  const currentEpisode = isValidEpisode ? rawEpisodeNumber : 1;

  const [anime, setAnime] = useState<AnimeDetail | null>(null);
  const [malInfo, setMalInfo] = useState<MalAnimeInfo | null>(null);
  const [episodeDiscovery, setEpisodeDiscovery] = useState<EpisodeDiscoveryResult | null>(null);
  const [loadingEpisodes, setLoadingEpisodes] = useState(true);

  const [backendProviders, setBackendProviders] = useState<StreamingProvider[]>([]);
  const [providerRegistry, setProviderRegistry] = useState<ProviderRegistrySummary[]>([]);
  const [resolvedSources, setResolvedSources] = useState<ResolvedEpisodeSource[]>([]);
  const [sourceResolveErrors, setSourceResolveErrors] = useState<
    Array<{ providerKey: string; providerName: string; message: string; status?: number }>
  >([]);
  const [sourceDiagnostics, setSourceDiagnostics] = useState<DiagnosticReport | null>(null);
  const [resolvingSources, setResolvingSources] = useState(true);
  const [resolveFatalError, setResolveFatalError] = useState<string | null>(null);

  const [language, setLanguage] = useState<PlaybackTrack>('sub');
  const [autoPlay, setAutoPlay] = useState<boolean>(getStoredAutoPlay);
  const [preferredProviderKey, setPreferredProviderKey] = useState<string | null>(
    getStoredPreferredProvider
  );
  const [switchingProviderKey, setSwitchingProviderKey] = useState<string | null>(null);
  const [forceStartZero, setForceStartZero] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [attemptedKeys, setAttemptedKeys] = useState<string[]>([]);
  const [failoverNotice, setFailoverNotice] = useState<string | null>(null);
  const [allServersUnavailable, setAllServersUnavailable] = useState(false);
  const [livePositionSec, setLivePositionSec] = useState<number | null>(null);
  const [providerSwitchStartSec, setProviderSwitchStartSec] = useState<number | null>(null);
  const confirmedInitRef = useRef<string>('');
  const preferredProviderRef = useRef<string | null>(preferredProviderKey);
  const initialResumeRef = useRef(0);
  const isMountedRef = useRef(true);
  const providerSwitchSeqRef = useRef(0);
  const providerSwitchAbortRef = useRef<AbortController | null>(null);

  const [loadingAnime, setLoadingAnime] = useState(true);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [animeLoadError, setAnimeLoadError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [guestBannerDismissed, setGuestBannerDismissed] = useState(false);

  const { getWatchlistEntry, upsertWatchlist, recordHistory, watchHistory, isGuestMode } = useLibrary();

  const savedHistoryForEp = useMemo(
    () =>
      watchHistory.find(
        (h) => h.anilistId === anilistId && h.episodeNumber === currentEpisode
      ),
    [watchHistory, anilistId, currentEpisode]
  );

  const computedInitialResume = forceStartZero
    ? 0
    : Math.max(0, Math.floor(savedHistoryForEp?.progressSec || 0));

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      providerSwitchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    preferredProviderRef.current = preferredProviderKey;
  }, [preferredProviderKey]);

  useEffect(() => {
    initialResumeRef.current = computedInitialResume;
  }, [computedInitialResume]);

  const resetPlaybackAttempt = useCallback(() => {
    providerSwitchSeqRef.current += 1;
    providerSwitchAbortRef.current?.abort();
    providerSwitchAbortRef.current = null;
    setSwitchingProviderKey(null);
    setAttemptedKeys([]);
    setFailoverNotice(null);
    setAllServersUnavailable(false);
    setResolveFatalError(null);
    confirmedInitRef.current = '';
  }, []);

  useEffect(() => {
    setForceStartZero(false);
    setLivePositionSec(null);
    setProviderSwitchStartSec(null);
    resetPlaybackAttempt();
  }, [anilistId, currentEpisode, resetPlaybackAttempt]);

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        void document.exitFullscreen?.().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('aniverve-autoplay', autoPlay ? '1' : '0');
    } catch {
      // Ignore storage failures
    }
  }, [autoPlay]);

  useEffect(() => {
    try {
      if (preferredProviderKey) {
        localStorage.setItem('aniverve-stream-provider', preferredProviderKey);
      } else {
        localStorage.removeItem('aniverve-stream-provider');
      }
    } catch {
      // Ignore storage failures
    }
  }, [preferredProviderKey]);

  useEffect(() => {
    if (!anilistId) {
      setAnime(null);
      setMalInfo(null);
      setEpisodeDiscovery(null);
      setLoadingAnime(false);
      setLoadingEpisodes(false);
      return;
    }
    const controller = new AbortController();
    setAnime(null);
    setMalInfo(null);
    setEpisodeDiscovery(null);
    setLoadingAnime(true);
    setLoadingEpisodes(true);
    setAnimeLoadError(null);

    anilistService
      .getDetails(anilistId, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setAnime(res.anime);
          setMalInfo(res.malInfo);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted && err?.name !== 'AbortError') {
          setAnimeLoadError(
            err instanceof Error ? err.message : 'Unable to fetch anime metadata from AniList.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingAnime(false);
      });

    anilistService
      .getEpisodes(anilistId, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) {
          setEpisodeDiscovery(res);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted && err?.name !== 'AbortError') {
          setEpisodeDiscovery({
            anilistId,
            malId: null,
            title: `Anime #${anilistId}`,
            catalogEpisodes: null,
            discoveredCount: 0,
            discoveryStatus: 'unavailable',
            partialResults: true,
            providers: [],
            episodes: [],
            cached: false,
            fetchedAt: new Date().toISOString(),
            notice: 'Unable to verify streaming episodes from providers right now.',
          });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingEpisodes(false);
      });

    return () => controller.abort();
  }, [anilistId]);

  const loadProviderRegistry = useCallback(async () => {
    if (!isMountedRef.current) return;
    setLoadingProviders(true);
    setNetworkError(null);
    try {
      const res = await streamingService.getProviderRegistry();
      if (!isMountedRef.current) return;
      setBackendProviders(res.providers);
      setProviderRegistry(res.registry);
    } catch (err) {
      if (!isMountedRef.current) return;
      setNetworkError(
        err instanceof Error
          ? `Unable to reach playback server configuration (${err.message}).`
          : 'Network interruption while loading playback configuration.'
      );
    } finally {
      if (isMountedRef.current) {
        setLoadingProviders(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadProviderRegistry();
  }, [loadProviderRegistry]);

  // Separate episode source resolution & verification from anime catalog fetch
  useEffect(() => {
    if (!anilistId || !isValidEpisode) {
      setResolvingSources(false);
      return;
    }

    const controller = new AbortController();
    setResolvingSources(true);
    setResolveFatalError(null);
    setResolvedSources([]);
    setSourceResolveErrors([]);
    setSourceDiagnostics(null);
    setAllServersUnavailable(false);
    setAttemptedKeys([]);
    setFailoverNotice(null);

    anilistService
      .getEpisodeSources(
        anilistId,
        currentEpisode,
        {
          lang: language,
          provider: preferredProviderRef.current || undefined,
          autoPlay,
          start: initialResumeRef.current,
        },
        controller.signal
      )
      .then((res) => {
        if (controller.signal.aborted) return;
        setResolvedSources(res.sources || []);
        setSourceResolveErrors(res.errors || []);
        setSourceDiagnostics(res.diagnostics || null);

        if (res.sources.length > 0 && res.errors.length > 0) {
          const picked =
            (preferredProviderRef.current &&
              res.sources.find((s) => s.providerKey === preferredProviderRef.current)) ||
            res.sources[0];
          const preferredFailed =
            preferredProviderRef.current &&
            res.errors.some((e) => e.providerKey === preferredProviderRef.current);
          if (!preferredProviderRef.current || preferredFailed) {
            const failedNames = res.errors.map((e) => e.providerName).join(', ');
            setFailoverNotice(
              `${failedNames} temporarily unavailable. Playing from ${picked.providerName}.`
            );
          }
        }

        if (res.allFailed || res.sources.length === 0) {
          setAllServersUnavailable(true);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted && err?.name !== 'AbortError') {
          if (err instanceof ApiError && err.data?.diagnostics) {
            setSourceDiagnostics(err.data.diagnostics as DiagnosticReport);
          }
          if (err instanceof ApiError && Array.isArray(err.data?.errors)) {
            setSourceResolveErrors(err.data.errors);
          }
          setResolveFatalError(
            err instanceof Error ? err.message : 'All available streaming providers failed.'
          );
          setAllServersUnavailable(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setResolvingSources(false);
        }
      });

    return () => controller.abort();
  }, [anilistId, currentEpisode, language, reloadNonce, isValidEpisode]);

  useEffect(() => {
    const onOffline = () => setNetworkError('Network connection interrupted. Playback may fail.');
    const onOnline = () => {
      setNetworkError(null);
      void loadProviderRegistry();
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [loadProviderRegistry]);

  const title = anime ? getPrimaryTitle(anime.title) : anilistId ? `Anime #${anilistId}` : 'Watch';

  useDocumentMeta({
    title: `Watch ${title} Episode ${currentEpisode}`,
    description: `Stream ${title} Episode ${currentEpisode} on AniVerve.`,
  });

  const playbackProviders: PlaybackProvider[] = useMemo(
    () => buildPlaybackProviders(backendProviders),
    [backendProviders]
  );

  const activeSource: ResolvedEpisodeSource | null = useMemo(() => {
    if (resolvedSources.length === 0) return null;
    const remaining = resolvedSources.filter((s) => !attemptedKeys.includes(s.providerKey));
    if (remaining.length === 0) return null;
    if (preferredProviderKey) {
      const preferred = remaining.find((s) => s.providerKey === preferredProviderKey);
      if (preferred) return preferred;
    }
    return remaining[0];
  }, [resolvedSources, attemptedKeys, preferredProviderKey]);

  const activeProvider: PlaybackProvider | null = useMemo(() => {
    if (playbackProviders.length === 0) return null;
    if (activeSource) {
      const matched = playbackProviders.find((p) => p.key === activeSource.providerKey);
      if (matched) return matched;
    }
    return playbackProviders[0];
  }, [playbackProviders, activeSource]);

  const activeProviderRole: 'primary' | 'backup' = useMemo(() => {
    if (activeSource) return activeSource.role;
    if (!activeProvider || playbackProviders.length === 0) return 'primary';
    return playbackProviders[0].key === activeProvider.key ? 'primary' : 'backup';
  }, [activeSource, activeProvider, playbackProviders]);

  const availableProviderOptions: StreamProviderOption[] = useMemo(() => {
    const seen = new Set<string>();
    const options: StreamProviderOption[] = [];

    const addOption = (
      key: string,
      name: string,
      role: 'primary' | 'backup',
      supportsLang: boolean,
      isEnabled: boolean
    ) => {
      if (seen.has(key)) return;
      seen.add(key);

      const resolved = resolvedSources.find((s) => s.providerKey === key);
      const resolveErr = sourceResolveErrors.find((e) => e.providerKey === key);
      const wasAttempted = attemptedKeys.includes(key);

      let status: StreamProviderOption['status'] = 'ready';
      if (switchingProviderKey === key) {
        status = 'loading';
      } else if (!isEnabled) {
        status = 'disabled';
      } else if (!supportsLang) {
        status = 'unsupported_audio';
      } else if (resolved && !wasAttempted) {
        status = 'ready';
      } else if (resolveErr || wasAttempted) {
        status = 'failed';
      } else if (resolvingSources) {
        status = 'loading';
      }

      options.push({
        key,
        name,
        role,
        status,
        format: resolved?.format,
        serverLabel: resolved?.serverLabel ?? undefined,
        errorMessage: resolveErr?.message,
      });
    };

    for (const p of playbackProviders) {
      const reg = providerRegistry.find((r) => r.key === p.key);
      addOption(
        p.key,
        p.name,
        p.priority <= 1 ? 'primary' : 'backup',
        p.supportsTrack(language),
        reg ? reg.isEnabled : true
      );
    }

    for (const reg of providerRegistry) {
      if (!seen.has(reg.key)) {
        addOption(
          reg.key,
          reg.name,
          reg.priority <= 1 ? 'primary' : 'backup',
          reg.supportedLanguages.includes(language),
          reg.isEnabled
        );
      }
    }

    for (const s of resolvedSources) {
      if (!seen.has(s.providerKey)) {
        addOption(s.providerKey, s.providerName, s.role, true, true);
      }
    }

    return options;
  }, [
    playbackProviders,
    providerRegistry,
    resolvedSources,
    sourceResolveErrors,
    attemptedKeys,
    switchingProviderKey,
    language,
    resolvingSources,
  ]);

  const effectiveStartSeconds = forceStartZero
    ? 0
    : Math.max(
        0,
        Math.floor(
          livePositionSec !== null ? livePositionSec : savedHistoryForEp?.progressSec || 0
        )
      );

  const discoveredEpisodes = episodeDiscovery?.episodes;

  const isDiscoveredPlayable = (item: { playable?: boolean; providers: string[] }): boolean =>
    item.playable !== false && item.providers.length > 0;

  const currentDiscoveredEpisode = useMemo(
    () => discoveredEpisodes?.find((e) => e.episodeNumber === currentEpisode) || null,
    [discoveredEpisodes, currentEpisode]
  );

  const availableEpisodeCount = useMemo(() => {
    if (discoveredEpisodes !== undefined) {
      return discoveredEpisodes.length;
    }
    if (!anime) return Math.max(1, Math.ceil(currentEpisode));
    if (anime.episodes && anime.episodes > 0) return anime.episodes;
    if (anime.nextAiringEpisode?.episode && anime.nextAiringEpisode.episode > 1) {
      return Math.max(currentEpisode, anime.nextAiringEpisode.episode - 1);
    }
    if (anime.streamingEpisodes && anime.streamingEpisodes.length > 0) {
      return Math.max(currentEpisode, anime.streamingEpisodes.length);
    }
    return Math.max(1, Math.ceil(currentEpisode));
  }, [discoveredEpisodes, anime, currentEpisode]);

  const currentEpIndex = useMemo(() => {
    if (!discoveredEpisodes || discoveredEpisodes.length === 0) return -1;
    return discoveredEpisodes.findIndex((e) => e.episodeNumber === currentEpisode);
  }, [discoveredEpisodes, currentEpisode]);

  const prevEpisodeTarget = useMemo(() => {
    if (discoveredEpisodes !== undefined) {
      if (discoveredEpisodes.length === 0) return null;
      if (currentEpIndex >= 0) {
        for (let i = currentEpIndex - 1; i >= 0; i -= 1) {
          if (isDiscoveredPlayable(discoveredEpisodes[i])) {
            return discoveredEpisodes[i].episodeNumber;
          }
        }
        return null;
      }
      for (let i = discoveredEpisodes.length - 1; i >= 0; i -= 1) {
        const ep = discoveredEpisodes[i];
        if (ep.episodeNumber < currentEpisode && isDiscoveredPlayable(ep)) {
          return ep.episodeNumber;
        }
      }
      return null;
    }
    return currentEpisode > 1 ? currentEpisode - 1 : null;
  }, [discoveredEpisodes, currentEpIndex, currentEpisode]);

  const nextEpisodeTarget = useMemo(() => {
    if (discoveredEpisodes !== undefined) {
      if (discoveredEpisodes.length === 0) return null;
      if (currentEpIndex >= 0) {
        for (let i = currentEpIndex + 1; i < discoveredEpisodes.length; i += 1) {
          if (isDiscoveredPlayable(discoveredEpisodes[i])) {
            return discoveredEpisodes[i].episodeNumber;
          }
        }
        return null;
      }
      for (let i = 0; i < discoveredEpisodes.length; i += 1) {
        const ep = discoveredEpisodes[i];
        if (ep.episodeNumber > currentEpisode && isDiscoveredPlayable(ep)) {
          return ep.episodeNumber;
        }
      }
      return null;
    }
    return currentEpisode < availableEpisodeCount ? currentEpisode + 1 : null;
  }, [discoveredEpisodes, currentEpIndex, currentEpisode, availableEpisodeCount]);

  const episodeOutOfRange =
    anime?.status === 'NOT_YET_RELEASED' ||
    Boolean(
      anime?.episodes &&
        anime.status === 'FINISHED' &&
        currentEpisode > anime.episodes &&
        !discoveredEpisodes?.some((e) => e.episodeNumber === currentEpisode)
    );

  const resolution = useMemo(() => {
    if (!anilistId) {
      return { valid: false, url: null, error: 'Invalid AniList anime ID.' };
    }
    if (!isValidEpisode) {
      return { valid: false, url: null, error: 'Invalid episode number requested.' };
    }
    if (anime?.status === 'NOT_YET_RELEASED') {
      return {
        valid: false,
        url: null,
        error: `${title} has not aired yet. Episodes are not available for playback.`,
      };
    }
    if (episodeOutOfRange && anime?.episodes) {
      return {
        valid: false,
        url: null,
        error: `Episode ${currentEpisode} is unavailable. ${title} has ${anime.episodes} total episode(s).`,
      };
    }
    if (resolvingSources || (loadingProviders && !activeSource)) {
      return { valid: true, url: null };
    }
    if (
      allServersUnavailable ||
      (!activeSource?.embedUrl && !activeSource?.proxiedHlsUrl && !activeSource?.hlsUrl)
    ) {
      if (currentDiscoveredEpisode?.playable === false) {
        return {
          valid: false,
          url: null,
          error:
            currentDiscoveredEpisode.unavailableReason ||
            `Episode ${currentEpisode} is currently unavailable on active streaming providers.`,
        };
      }
      if (!loadingEpisodes && episodeDiscovery?.discoveryStatus === 'unavailable') {
        return {
          valid: false,
          url: null,
          error:
            episodeDiscovery.notice ||
            'No playable streams are available for this anime from active providers yet.',
        };
      }
      const allNotFound =
        sourceResolveErrors.length > 0 && sourceResolveErrors.every((e) => e.status === 404);
      if (resolveFatalError) {
        return { valid: false, url: null, error: resolveFatalError };
      }
      if (allNotFound) {
        return {
          valid: false,
          url: null,
          error: 'Episode unavailable from current providers.',
        };
      }
      if (providerRegistry.length > 0 && providerRegistry.every((p) => !p.isEnabled)) {
        return {
          valid: false,
          url: null,
          error: 'All streaming providers are disabled in configuration.',
        };
      }
      return {
        valid: false,
        url: null,
        error:
          sourceResolveErrors[0]?.message ||
          'All available streaming providers failed. Retry.',
      };
    }

    const rawUrl = activeSource.embedUrl || activeSource.proxiedHlsUrl || activeSource.hlsUrl || null;
    const adjustedUrl =
      providerSwitchStartSec !== null && providerSwitchStartSec > 0
        ? applyStartPositionToUrl(rawUrl, providerSwitchStartSec)
        : rawUrl;

    return {
      valid: true,
      url: adjustedUrl,
    };
  }, [
    anilistId,
    isValidEpisode,
    anime,
    title,
    episodeOutOfRange,
    currentEpisode,
    resolvingSources,
    loadingProviders,
    activeSource,
    allServersUnavailable,
    currentDiscoveredEpisode,
    loadingEpisodes,
    episodeDiscovery?.discoveryStatus,
    episodeDiscovery?.notice,
    sourceResolveErrors,
    resolveFatalError,
    providerRegistry,
    providerSwitchStartSec,
  ]);

  const handleProviderFailure = useCallback(
    (reason: string) => {
      const failedKey = activeSource?.providerKey || activeProvider?.key;
      if (!failedKey) {
        setAllServersUnavailable(true);
        return;
      }

      const nextAttempted = attemptedKeys.includes(failedKey)
        ? attemptedKeys
        : [...attemptedKeys, failedKey];
      setAttemptedKeys(nextAttempted);

      const nextSource = resolvedSources.find(
        (s) => s.providerKey !== failedKey && !nextAttempted.includes(s.providerKey)
      );

      if (nextSource) {
        setFailoverNotice(
          `${activeSource?.providerName || failedKey} temporarily unavailable. Trying ${nextSource.providerName}...`
        );
        void streamingService.reportTelemetry({
          event: 'failover',
          from: failedKey,
          to: nextSource.providerKey,
          reason,
          anilistId: anime?.id || anilistId || 0,
          episode: currentEpisode,
        });
      } else {
        setFailoverNotice(null);
        setAllServersUnavailable(true);
        void streamingService.reportTelemetry({
          event: 'error',
          server: failedKey,
          reason,
          anilistId: anime?.id || anilistId || 0,
          episode: currentEpisode,
        });
      }
    },
    [activeSource, activeProvider, attemptedKeys, resolvedSources, anime?.id, anilistId, currentEpisode]
  );

  const handleRefreshActiveSource = useCallback(async (): Promise<boolean> => {
    if (!anilistId || !isValidEpisode) return false;
    try {
      const targetKey = activeSource?.providerKey || activeProvider?.key;
      const res = await anilistService.getEpisodeSources(anilistId, currentEpisode, {
        lang: language,
        provider: targetKey,
        autoPlay,
        start: livePositionSec !== null ? livePositionSec : initialResumeRef.current,
        refresh: true,
      });
      if (res.sources && res.sources.length > 0) {
        setResolvedSources(res.sources);
        setSourceResolveErrors(res.errors || []);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [anilistId, isValidEpisode, activeSource?.providerKey, activeProvider?.key, currentEpisode, language, autoPlay, livePositionSec]);

  const handleSelectProvider = useCallback(
    async (providerKey: string) => {
      setPreferredProviderKey(providerKey);
      preferredProviderRef.current = providerKey;
      setFailoverNotice(null);
      setResolveFatalError(null);
      confirmedInitRef.current = '';
      if (livePositionSec !== null && livePositionSec > 0) {
        setProviderSwitchStartSec(livePositionSec);
      }

      const alreadyResolved = resolvedSources.some((s) => s.providerKey === providerKey);
      const previouslyFailed = attemptedKeys.includes(providerKey);

      if (alreadyResolved && !previouslyFailed) {
        setAttemptedKeys([]);
        setAllServersUnavailable(false);
        return;
      }

      if (!anilistId || !isValidEpisode) return;

      providerSwitchAbortRef.current?.abort();
      const controller = new AbortController();
      providerSwitchAbortRef.current = controller;
      const reqId = ++providerSwitchSeqRef.current;

      setAttemptedKeys((prev) => prev.filter((k) => k !== providerKey));
      setSwitchingProviderKey(providerKey);
      try {
        const res = await anilistService.getEpisodeSources(
          anilistId,
          currentEpisode,
          {
            lang: language,
            provider: providerKey,
            autoPlay,
            start: livePositionSec !== null ? livePositionSec : initialResumeRef.current,
            refresh: true,
          },
          controller.signal
        );

        if (controller.signal.aborted || reqId !== providerSwitchSeqRef.current || !isMountedRef.current) {
          return;
        }

        if (res.diagnostics) {
          setSourceDiagnostics(res.diagnostics);
        }
        const freshForSelected = (res.sources || []).find((s) => s.providerKey === providerKey);
        if (freshForSelected) {
          setResolvedSources((prev) => {
            const byKey = new Map<string, ResolvedEpisodeSource>();
            for (const s of res.sources || []) byKey.set(s.providerKey, s);
            for (const s of prev) {
              if (!byKey.has(s.providerKey)) byKey.set(s.providerKey, s);
            }
            return Array.from(byKey.values());
          });
          setSourceResolveErrors(res.errors || []);
          setAttemptedKeys([]);
          setAllServersUnavailable(false);
        } else {
          const targetErr = (res.errors || []).find((e) => e.providerKey === providerKey);
          if (res.errors && res.errors.length > 0) {
            setSourceResolveErrors(res.errors);
          }
          setAttemptedKeys((prev) => (prev.includes(providerKey) ? prev : [...prev, providerKey]));
          const fallback = resolvedSources.find((s) => s.providerKey !== providerKey);
          if (fallback) {
            setFailoverNotice(
              `${targetErr?.providerName || providerKey} unavailable (${targetErr?.message || 'stream failed'}). Continuing on ${fallback.providerName}.`
            );
          } else {
            setAllServersUnavailable(true);
            setResolveFatalError(targetErr?.message || 'Selected stream provider unavailable.');
          }
        }
      } catch (err: any) {
        if (
          controller.signal.aborted ||
          err?.name === 'AbortError' ||
          reqId !== providerSwitchSeqRef.current ||
          !isMountedRef.current
        ) {
          return;
        }
        if (err instanceof ApiError && err.data?.diagnostics) {
          setSourceDiagnostics(err.data.diagnostics as DiagnosticReport);
        }
        const msg = err instanceof Error ? err.message : 'Unable to switch stream provider.';
        setAttemptedKeys((prev) => (prev.includes(providerKey) ? prev : [...prev, providerKey]));
        const fallback = resolvedSources.find((s) => s.providerKey !== providerKey);
        if (fallback) {
          setFailoverNotice(`${msg} Continuing on ${fallback.providerName}.`);
        } else {
          setResolveFatalError(msg);
          setAllServersUnavailable(true);
        }
      } finally {
        if (reqId === providerSwitchSeqRef.current && isMountedRef.current) {
          setSwitchingProviderKey(null);
        }
      }
    },
    [
      anilistId,
      isValidEpisode,
      currentEpisode,
      language,
      autoPlay,
      livePositionSec,
      resolvedSources,
      attemptedKeys,
    ]
  );

  const handleEpisodeSelect = useCallback(
    (ep: number) => {
      if (!Number.isFinite(ep) || ep < 0 || !anilistId) return;
      const targetSlug = anime?.slug || slug || String(anilistId);
      setForceStartZero(false);
      setLivePositionSec(null);
      resetPlaybackAttempt();
      navigate(`/watch/${targetSlug}/${ep}`);
    },
    [anilistId, anime?.slug, slug, resetPlaybackAttempt, navigate]
  );

  const handleSelectLanguage = useCallback(
    (nextLang: PlaybackTrack) => {
      setLanguage(nextLang);
      resetPlaybackAttempt();
    },
    [resetPlaybackAttempt]
  );

  const handleRetry = useCallback(() => {
    resetPlaybackAttempt();
    setReloadNonce((n) => n + 1);
    void loadProviderRegistry();
  }, [resetPlaybackAttempt, loadProviderRegistry]);

  const handleFrameLoaded = useCallback(() => {
    const providerKey = activeSource?.providerKey || activeProvider?.key;
    if (anime && providerKey) {
      void recordHistory({
        anilistId: anime.id,
        animeTitle: title,
        animeSlug: anime.slug,
        coverImage: anime.coverImage?.large || anime.coverImage?.extraLarge,
        episodeNumber: currentEpisode,
        providerKey,
        language,
        progressSec: effectiveStartSeconds,
        completed: false,
      });
    }
  }, [
    activeSource?.providerKey,
    activeProvider?.key,
    anime,
    recordHistory,
    title,
    currentEpisode,
    language,
    effectiveStartSeconds,
  ]);

  const handlePlaybackConfirmed = useCallback(() => {
    const providerKey = activeSource?.providerKey || activeProvider?.key;
    if (!providerKey || !anilistId) return;
    const initSig = `${providerKey}:${currentEpisode}:${language}`;
    if (confirmedInitRef.current === initSig) return;
    confirmedInitRef.current = initSig;
    void streamingService.reportTelemetry({
      event: 'init_success',
      server: providerKey,
      anilistId: anime?.id || anilistId,
      episode: currentEpisode,
      latencyMs: activeSource?.latencyMs,
    });
  }, [
    activeSource?.providerKey,
    activeSource?.latencyMs,
    activeProvider?.key,
    anilistId,
    currentEpisode,
    language,
    anime?.id,
  ]);

  const handlePositionUpdate = useCallback((sec: number) => {
    setLivePositionSec(sec);
    setForceStartZero(false);
  }, []);

  const handleToggleAutoPlay = useCallback(() => {
    setAutoPlay((v) => !v);
  }, []);

  const handlePrevEpisode = useCallback(() => {
    if (prevEpisodeTarget !== null) {
      handleEpisodeSelect(prevEpisodeTarget);
    }
  }, [prevEpisodeTarget, handleEpisodeSelect]);

  const handleNextEpisode = useCallback(() => {
    if (nextEpisodeTarget !== null) {
      handleEpisodeSelect(nextEpisodeTarget);
    }
  }, [nextEpisodeTarget, handleEpisodeSelect]);

  const handleResetStart = useCallback(() => {
    setForceStartZero(true);
    setLivePositionSec(0);
  }, []);

  const handleSelectProviderClick = useCallback(
    (key: string) => {
      void handleSelectProvider(key);
    },
    [handleSelectProvider]
  );

  // All hooks must execute unconditionally above this point.
  if (loadingAnime && !anime) return <DetailSkeleton />;

  if (!anilistId) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-8 text-center space-y-3">
        <AlertTriangle className="h-8 w-8 text-rose-500 mx-auto" />
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-[#F5F3FF]">Invalid AniList ID</h1>
        <p className="text-sm text-zinc-500 dark:text-[#A5A1B5]">
          Could not extract a valid numeric AniList anime ID from this URL.
        </p>
        <Link
          to="/explore"
          className="inline-flex items-center rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-medium text-white transition-colors"
        >
          Browse Anime Catalog
        </Link>
      </div>
    );
  }

  const watchedEpisodes = watchHistory
    .filter((h) => h.anilistId === anilistId)
    .map((h) => h.episodeNumber);

  const watchlistEntry = getWatchlistEntry(anilistId);
  const cleanDescription = stripHtml(anime?.description);

  const isLoadingStage = resolvingSources || (loadingProviders && !activeSource);
  const effectiveStreamError = !isLoadingStage && !resolution.valid ? resolution.error || null : null;
  const relatedAnime = anime?.relations?.edges?.slice(0, 6) || [];
  const recommendedAnime =
    anime?.recommendations?.nodes?.filter((n) => n.mediaRecommendation).slice(0, 6) || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/anime/${anime?.slug || slug}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-[#A5A1B5] hover:text-[#9B87FF] mb-1 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to {title}
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-[#F5F3FF] truncate">
            {title} — Episode {currentEpisode}
          </h1>
          <p className="text-xs text-zinc-500 dark:text-[#A5A1B5] mt-0.5 tabular-nums">
            AniList #{anime?.id || anilistId}
            {anime?.idMal ? ` · MAL #${anime.idMal}` : ''}
            {' · '}Audio: {language.toUpperCase()}
            {discoveredEpisodes?.length
              ? ` · ${discoveredEpisodes.length} Discovered Episodes`
              : anime?.episodes
                ? ` · ${anime.episodes} Catalog Episodes`
                : ''}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={`/anime/${anime?.slug || slug}`}
            className="av-btn-press inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-2 text-xs font-medium text-zinc-800 dark:text-[#F5F3FF] hover:border-[#9B87FF] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
          >
            <Info className="h-3.5 w-3.5" />
            Details
          </Link>

          <button
            type="button"
            onClick={() =>
              anime &&
              upsertWatchlist({
                anilistId: anime.id,
                animeTitle: title,
                animeSlug: anime.slug,
                coverImage: anime.coverImage?.large || anime.coverImage?.extraLarge,
                totalEpisodes: anime.episodes || discoveredEpisodes?.length || null,
                status: 'WATCHING',
                episodesWatched: Math.max(watchlistEntry?.episodesWatched || 0, currentEpisode),
              })
            }
            className="av-btn-press inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3.5 py-2 text-xs font-medium text-zinc-800 dark:text-[#F5F3FF] hover:border-[#9B87FF] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
          >
            {watchlistEntry ? (
              <Check className="h-3.5 w-3.5 text-[#9B87FF]" />
            ) : (
              <Bookmark className="h-3.5 w-3.5" />
            )}
            {watchlistEntry
              ? `Watching (Ep ${Math.max(watchlistEntry.episodesWatched, currentEpisode)})`
              : 'Save Progress'}
          </button>
        </div>
      </div>

      {(animeLoadError || networkError) && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-300">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>{networkError || animeLoadError}</span>
        </div>
      )}

      {isGuestMode && !guestBannerDismissed && (
        <div
          role="region"
          aria-label="Guest playback notice"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#9B87FF]/30 bg-[#7C5CFF]/8 px-4 py-2.5 text-xs"
        >
          <span className="text-zinc-700 dark:text-[#D6CEFF]">
            Playing as guest — watch progress saved locally on this device.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/login"
              className="av-btn-press rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-3 py-1.5 font-semibold text-white"
            >
              Sign in to sync
            </Link>
            <button
              type="button"
              onClick={() => setGuestBannerDismissed(true)}
              aria-label="Dismiss guest notice"
              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Above-the-fold Stream Provider Switcher */}
      {availableProviderOptions.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#11111B] px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-[#F5F3FF] whitespace-nowrap shrink-0">
              <Server className="h-3.5 w-3.5 text-[#9B87FF]" />
              Stream Provider
            </span>
            <div
              role="group"
              aria-label="Stream provider selector"
              className="flex flex-wrap items-center gap-1.5"
            >
              {availableProviderOptions.map((opt) => {
                const isSelected =
                  (activeSource?.providerKey === opt.key && !effectiveStreamError) ||
                  (!activeSource && preferredProviderKey === opt.key);
                const isUnavailable =
                  opt.status === 'disabled' || opt.status === 'unsupported_audio';
                const isBusy = Boolean(switchingProviderKey);

                const suffix =
                  switchingProviderKey === opt.key
                    ? 'Switching'
                    : opt.status === 'loading'
                      ? 'Checking'
                      : opt.status === 'disabled'
                        ? 'Disabled'
                        : opt.status === 'unsupported_audio'
                          ? `${language.toUpperCase()} N/A`
                          : opt.status === 'failed'
                            ? 'Retry'
                            : opt.format
                              ? opt.format.toUpperCase()
                              : opt.role === 'primary'
                                ? 'Primary'
                                : 'Backup';

                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={isUnavailable || isBusy}
                    aria-pressed={isSelected}
                    title={
                      opt.errorMessage ||
                      (opt.status === 'unsupported_audio'
                        ? `${opt.name} does not support ${language.toUpperCase()} audio`
                        : opt.status === 'disabled'
                          ? `${opt.name} is currently disabled`
                          : `Stream from ${opt.name}`)
                    }
                    onClick={() => handleSelectProviderClick(opt.key)}
                    className={`av-btn-press inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                      isSelected
                        ? 'border-[#7C5CFF] bg-[#7C5CFF] text-white'
                        : opt.status === 'failed'
                          ? 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:border-amber-400'
                          : 'border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#171722] text-zinc-800 dark:text-[#F5F3FF] hover:border-[#9B87FF]'
                    } disabled:opacity-45 disabled:cursor-not-allowed`}
                  >
                    {(opt.status === 'loading' || switchingProviderKey === opt.key) && (
                      <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    )}
                    <span>{opt.name}</span>
                    <span
                      aria-hidden="true"
                      className={isSelected ? 'text-white/70' : 'text-zinc-400 dark:text-[#A5A1B5]/60'}
                    >
                      ·
                    </span>
                    <span
                      className={
                        isSelected
                          ? 'text-white/90 font-normal'
                          : 'text-zinc-500 dark:text-[#A5A1B5] font-normal'
                      }
                    >
                      {suffix}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <span className="text-[11px] text-zinc-500 dark:text-[#A5A1B5] tabular-nums whitespace-nowrap">
            {activeSource
              ? `Playing ${activeSource.providerName}${activeSource.serverLabel ? ` · ${activeSource.serverLabel}` : ''}`
              : resolvingSources
                ? 'Checking stream providers...'
                : 'Select a provider'}
          </span>
        </div>
      )}

      {/* Cinema Video Stage */}
      <Player
        embedUrl={resolution.url}
        source={activeSource}
        provider={activeProvider}
        serverRole={activeProviderRole}
        availableProviders={availableProviderOptions}
        selectedProviderKey={activeSource?.providerKey || preferredProviderKey}
        switchingProvider={Boolean(switchingProviderKey)}
        title={title}
        episode={currentEpisode}
        language={language}
        loadingStream={Boolean(switchingProviderKey) || (isLoadingStage && !resolution.url)}
        loadingStatusText={
          switchingProviderKey
            ? 'Switching stream provider...'
            : attemptedKeys.length > 0
              ? 'Trying another streaming provider...'
              : 'Checking streaming providers...'
        }
        streamError={effectiveStreamError}
        failoverNotice={failoverNotice}
        diagnosticReport={sourceDiagnostics}
        hasPrevEpisode={prevEpisodeTarget !== null && !episodeOutOfRange}
        hasNextEpisode={nextEpisodeTarget !== null && !episodeOutOfRange}
        autoPlay={autoPlay}
        startSeconds={effectiveStartSeconds}
        reloadNonce={reloadNonce}
        onSelectProvider={handleSelectProviderClick}
        onSelectLanguage={handleSelectLanguage}
        onToggleAutoPlay={handleToggleAutoPlay}
        onPrevEpisode={handlePrevEpisode}
        onNextEpisode={handleNextEpisode}
        onResetStart={handleResetStart}
        onRetry={handleRetry}
        onRefreshSource={handleRefreshActiveSource}
        onFrameLoaded={handleFrameLoaded}
        onPlaybackConfirmed={handlePlaybackConfirmed}
        onPositionUpdate={handlePositionUpdate}
        onProviderFailure={handleProviderFailure}
      />

      {/* Episode List */}
      <EpisodeSelector
        totalEpisodes={availableEpisodeCount}
        catalogEpisodes={anime?.episodes}
        currentEpisode={currentEpisode}
        discoveredEpisodes={discoveredEpisodes}
        loading={loadingEpisodes}
        discoveryStatus={episodeDiscovery?.discoveryStatus}
        notice={episodeDiscovery?.notice}
        watchedEpisodes={watchedEpisodes}
        isEstimatedCount={!anime?.episodes}
        onSelectEpisode={handleEpisodeSelect}
      />

      {/* Anime Description & Metadata Summary */}
      {anime && (
        <section className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] p-5 sm:p-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-zinc-900 dark:text-[#F5F3FF]">
              About {title}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-[#A5A1B5] tabular-nums">
              <span>{formatFormat(anime.format)}</span>
              <span aria-hidden="true">·</span>
              <span>{formatSeason(anime.season, anime.seasonYear)}</span>
              {malInfo?.score && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-[#7C5CFF] dark:text-[#9B87FF]">
                    MAL {formatMalScore(malInfo.score)}
                  </span>
                </>
              )}
              {anime.averageScore && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">AniList {formatScore(anime.averageScore)}</span>
                </>
              )}
            </div>
          </div>
          {anime.genres && anime.genres.length > 0 && (
            <p className="text-xs text-zinc-500 dark:text-[#A5A1B5]">
              {anime.genres.join(' · ')}
            </p>
          )}
          {cleanDescription && (
            <p className="text-sm leading-relaxed text-zinc-700 dark:text-[#F5F3FF]/85 whitespace-pre-line">
              {cleanDescription}
            </p>
          )}
        </section>
      )}

      {/* Related Anime */}
      {relatedAnime.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-[#F5F3FF]">
            Related Anime
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {relatedAnime.map((edge, idx) => (
              <div key={`${edge.node.id}-${idx}`} className="space-y-1">
                <p className="text-[11px] font-medium text-[#7C5CFF] dark:text-[#9B87FF]">
                  {edge.relationType.replace(/_/g, ' ')}
                </p>
                <AnimeCard anime={edge.node} showQuickWatch={false} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Next Episode / Similar Recommendations */}
      {recommendedAnime.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-[#F5F3FF]">
            Recommended Next Watch
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {recommendedAnime.map((rec) => (
              <AnimeCard key={rec.id} anime={rec.mediaRecommendation!} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
