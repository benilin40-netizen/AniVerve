import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Server,
  SlidersHorizontal,
  Subtitles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { DiagnosticReport, ResolvedEpisodeSource } from '../../types/anime.ts';
import type { PlaybackProvider, PlaybackTrack } from '../../providers/types.ts';
import {
  detectVideoElementAudioState,
  formatAudioTrackLabel,
  inspectHlsManifest,
  pickPreferredAudioTrackIndex,
  type SelectableAudioTrack,
} from '../../utils/hlsAudio.ts';

export interface StreamProviderOption {
  key: string;
  name: string;
  role: 'primary' | 'backup';
  status: 'ready' | 'failed' | 'loading' | 'disabled' | 'unsupported_audio';
  format?: 'hls' | 'mp4' | 'embed';
  serverLabel?: string;
  errorMessage?: string;
}

interface PlayerProps {
  embedUrl: string | null;
  source?: ResolvedEpisodeSource | null;
  provider: PlaybackProvider | null;
  serverRole: 'primary' | 'backup';
  availableProviders?: StreamProviderOption[];
  selectedProviderKey?: string | null;
  switchingProvider?: boolean;
  title: string;
  episode: number;
  language: PlaybackTrack;
  loadingStream: boolean;
  loadingStatusText?: string;
  streamError: string | null;
  failoverNotice: string | null;
  diagnosticReport?: DiagnosticReport | null;
  hasPrevEpisode: boolean;
  hasNextEpisode: boolean;
  autoPlay: boolean;
  startSeconds: number;
  reloadNonce: number;
  onSelectProvider?: (providerKey: string) => void;
  onSelectLanguage: (lang: PlaybackTrack) => void;
  onToggleAutoPlay: () => void;
  onPrevEpisode: () => void;
  onNextEpisode: () => void;
  onResetStart: () => void;
  onRetry: () => void;
  onRefreshSource?: () => Promise<boolean>;
  onFrameLoaded: () => void;
  onPlaybackConfirmed: () => void;
  onPositionUpdate: (sec: number) => void;
  onProviderFailure: (reason: string) => void;
}

const VOLUME_STORAGE_KEY = 'aniverve-player-volume';
const SUBTITLE_STORAGE_KEY = 'aniverve-subtitle-lang';

function getOriginBase(): string {
  return typeof window !== 'undefined' ? window.location.origin : 'https://localhost';
}

function getInitialVolume(): number {
  try {
    const raw = Number(localStorage.getItem(VOLUME_STORAGE_KEY));
    if (Number.isFinite(raw) && raw > 0 && raw <= 1) return raw;
  } catch {
    // Ignore storage issues
  }
  return 1;
}

function getStoredSubtitlePref(): string {
  try {
    return localStorage.getItem(SUBTITLE_STORAGE_KEY) || 'English';
  } catch {
    return 'English';
  }
}

function formatSeconds(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

function safeParseMessageData(raw: unknown): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, any>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function isDirectStreamUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const pathname = new URL(url, getOriginBase()).pathname.toLowerCase();
    return pathname.endsWith('.m3u8') || pathname.endsWith('.mp4') || pathname.endsWith('.webm');
  } catch {
    return false;
  }
}

export function Player({
  embedUrl,
  source,
  provider,
  serverRole,
  availableProviders = [],
  selectedProviderKey,
  switchingProvider = false,
  title,
  episode,
  language,
  loadingStream,
  loadingStatusText,
  streamError,
  failoverNotice,
  diagnosticReport = null,
  hasPrevEpisode,
  hasNextEpisode,
  autoPlay,
  startSeconds,
  reloadNonce,
  onSelectProvider,
  onSelectLanguage,
  onToggleAutoPlay,
  onPrevEpisode,
  onNextEpisode,
  onResetStart,
  onRetry,
  onRefreshSource,
  onFrameLoaded,
  onPlaybackConfirmed,
  onPositionUpdate,
  onProviderFailure,
}: PlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [frameLoaded, setFrameLoaded] = useState(false);
  const [playbackConfirmed, setPlaybackConfirmed] = useState(false);

  // Direct <video> + hls.js audio, quality, subtitle & buffering state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState<number>(getInitialVolume);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [audioTracks, setAudioTracks] = useState<SelectableAudioTrack[]>([]);
  const [activeAudioTrackId, setActiveAudioTrackId] = useState<number>(-1);
  const [audioDiagnosticNote, setAudioDiagnosticNote] = useState<string | null>(null);
  const [qualityOptions, setQualityOptions] = useState<
    Array<{ index: number; label: string; height?: number }>
  >([]);
  const [activeQualityIndex, setActiveQualityIndex] = useState<number>(-1);
  const [selectedSubtitle, setSelectedSubtitle] = useState<string>(getStoredSubtitlePref);
  const [internalRefreshNonce, setInternalRefreshNonce] = useState(0);
  const [nativeFallbackToEmbed, setNativeFallbackToEmbed] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);

  const handleCopyDiagnostics = async () => {
    if (!diagnosticReport) return;
    const lines = [
      'AniVerve Playback Diagnostic Report',
      `Title: ${diagnosticReport.animeTitle || title}`,
      `AniList ID: ${diagnosticReport.anilistId}${diagnosticReport.malId ? ` | MAL ID: ${diagnosticReport.malId}` : ''}`,
      `Episode: ${diagnosticReport.episodeNumber} | Track: ${diagnosticReport.audioTrack.toUpperCase()}`,
      `Requested Provider: ${diagnosticReport.requestedProvider || 'auto'}`,
      `Generated: ${diagnosticReport.generatedAt}`,
      `Suggested Action: ${diagnosticReport.suggestedAction}`,
      'Attempted Providers:',
      ...diagnosticReport.attemptedProviders.map(
        (a) =>
          `  - ${a.providerName} (${a.providerKey}) [${a.stage}] ${a.errorCategory}${a.httpStatus ? ` HTTP ${a.httpStatus}` : ''} (${a.latencyMs}ms): ${a.message}`
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedDiagnostics(true);
      setTimeout(() => setCopiedDiagnostics(false), 2500);
    } catch {
      // Clipboard unavailable
    }
  };

  const frameLoadedRef = useRef(false);
  const failureTriggeredRef = useRef(false);
  const tokenRefreshTriedRef = useRef(false);
  const onProviderFailureRef = useRef(onProviderFailure);
  const onFrameLoadedRef = useRef(onFrameLoaded);
  const onPlaybackConfirmedRef = useRef(onPlaybackConfirmed);
  const onPositionUpdateRef = useRef(onPositionUpdate);
  const onRefreshSourceRef = useRef(onRefreshSource);

  useEffect(() => {
    onProviderFailureRef.current = onProviderFailure;
    onFrameLoadedRef.current = onFrameLoaded;
    onPlaybackConfirmedRef.current = onPlaybackConfirmed;
    onPositionUpdateRef.current = onPositionUpdate;
    onRefreshSourceRef.current = onRefreshSource;
  }, [
    onProviderFailure,
    onFrameLoaded,
    onPlaybackConfirmed,
    onPositionUpdate,
    onRefreshSource,
  ]);

  // Determine playback mode: direct HLS/MP4 (<video> + full hls.js) vs sandboxed <iframe> embed
  const directMediaUrl = useMemo(() => {
    if (source?.directPlayable) {
      const candidate = source.proxiedHlsUrl || source.hlsUrl || null;
      if (candidate) return candidate;
    }
    if (isDirectStreamUrl(embedUrl)) return embedUrl;
    return null;
  }, [source?.directPlayable, source?.proxiedHlsUrl, source?.hlsUrl, embedUrl]);

  useEffect(() => {
    setNativeFallbackToEmbed(false);
  }, [source?.providerKey, directMediaUrl, episode, language, reloadNonce, streamError]);

  const useNativeVideoMode = Boolean(directMediaUrl && !nativeFallbackToEmbed && !streamError);
  const activeUrl = useNativeVideoMode ? directMediaUrl : embedUrl;

  const triggerFailureOnce = (reason: string) => {
    if (failureTriggeredRef.current) return;
    failureTriggeredRef.current = true;
    onProviderFailureRef.current(reason);
  };

  const handleNativeStreamFailure = (reason: string) => {
    if (embedUrl && !nativeFallbackToEmbed && !failureTriggeredRef.current) {
      frameLoadedRef.current = false;
      setFrameLoaded(false);
      setPlaybackConfirmed(false);
      setIsBuffering(false);
      setAudioDiagnosticNote('Switched to provider embed player');
      setNativeFallbackToEmbed(true);
      return;
    }
    triggerFailureOnce(reason);
  };

  // Validate active URL and enforce 30s init timeout
  useEffect(() => {
    setFrameLoaded(false);
    setPlaybackConfirmed(false);
    setAutoplayBlocked(false);
    setIsBuffering(false);
    setAudioTracks([]);
    setActiveAudioTrackId(-1);
    setAudioDiagnosticNote(null);
    setQualityOptions([]);
    setActiveQualityIndex(-1);
    frameLoadedRef.current = false;
    failureTriggeredRef.current = false;
    tokenRefreshTriedRef.current = false;

    if (!activeUrl || streamError) return;

    try {
      const originBase = getOriginBase();
      const parsed = new URL(activeUrl, originBase);
      const host = parsed.hostname;
      const isSameOrigin = parsed.origin === originBase;
      if (
        !isSameOrigin &&
        parsed.protocol !== 'https:' &&
        host !== '127.0.0.1' &&
        host !== 'localhost'
      ) {
        triggerFailureOnce('Stream URL must use HTTPS.');
        return;
      }
    } catch {
      triggerFailureOnce('Invalid streaming player URL.');
      return;
    }

    const initTimer = setTimeout(() => {
      if (!frameLoadedRef.current && !failureTriggeredRef.current) {
        if (useNativeVideoMode && embedUrl && !nativeFallbackToEmbed) {
          handleNativeStreamFailure(
            `${provider?.name || 'Direct stream'} timed out initializing.`
          );
        } else {
          triggerFailureOnce(
            `${provider?.name || 'Streaming provider'} took too long to initialize.`
          );
        }
      }
    }, 30000);

    return () => {
      clearTimeout(initTimer);
    };
  }, [activeUrl, provider?.key, episode, language, reloadNonce, streamError, useNativeVideoMode, nativeFallbackToEmbed, embedUrl]);

  // Direct HTML5 <video> + full HLS.js (with AudioTrackController + separate audio playlist support)
  useEffect(() => {
    if (!useNativeVideoMode || !directMediaUrl) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let hls: Hls | null = null;
    let audioVerifyTriggered = false;
    let manifestReportedNoAudio = false;

    // Never leave player unintentionally muted
    video.muted = isMuted;
    video.volume = volume;
    if (startSeconds > 0) {
      video.currentTime = startSeconds;
    }

    const attemptPlayWithSound = async () => {
      try {
        video.muted = isMuted;
        await video.play();
        if (!cancelled) {
          setAutoplayBlocked(false);
          setIsPlaying(true);
        }
      } catch (err: any) {
        if (cancelled) return;
        if (err?.name === 'NotAllowedError') {
          setAutoplayBlocked(true);
          setIsPlaying(false);
        }
      }
    };

    const syncAudioTrackList = (tracks: Array<{ id?: number; name?: string; lang?: string; default?: boolean }>) => {
      if (cancelled) return;
      const normalized: SelectableAudioTrack[] = tracks.map((t, idx) => ({
        id: typeof t.id === 'number' ? t.id : idx,
        name: t.name || t.lang || `Track ${idx + 1}`,
        lang: t.lang,
        default: t.default,
      }));
      setAudioTracks(normalized);

      if (normalized.length > 0 && hls) {
        const preferred = pickPreferredAudioTrackIndex(normalized, language);
        if (preferred >= 0 && hls.audioTrack !== preferred) {
          hls.audioTrack = preferred;
        }
        setActiveAudioTrackId(hls.audioTrack >= 0 ? hls.audioTrack : normalized[0].id);
      }
    };

    const applySubtitlePreference = () => {
      if (cancelled || !video.textTracks) return;
      const pref = selectedSubtitle.trim().toLowerCase();
      let matched = false;
      for (let i = 0; i < video.textTracks.length; i += 1) {
        const track = video.textTracks[i];
        const trackLabel = (track.label || '').trim().toLowerCase();
        if (pref === 'off' || pref === 'none') {
          track.mode = 'disabled';
        } else if (trackLabel === pref) {
          track.mode = 'showing';
          matched = true;
        } else {
          track.mode = 'disabled';
        }
      }
      if (!matched && pref !== 'off' && pref !== 'none' && video.textTracks.length > 0) {
        const englishIdx = Array.from({ length: video.textTracks.length }).findIndex((_, idx) =>
          (video.textTracks[idx].label || '').toLowerCase().includes('english')
        );
        const fallbackIdx = englishIdx >= 0 ? englishIdx : 0;
        video.textTracks[fallbackIdx].mode = 'showing';
      }
    };

    const onLoadedMetadata = () => {
      if (cancelled) return;
      frameLoadedRef.current = true;
      setFrameLoaded(true);
      setIsBuffering(false);
      applySubtitlePreference();
      onFrameLoadedRef.current();
      const diag = detectVideoElementAudioState(video);
      if (diag.hasPlayableAudio === false && manifestReportedNoAudio) {
        handleNativeStreamFailure(
          `${provider?.name || 'Stream'} contains video only (no playable audio track).`
        );
        return;
      }
      if (autoPlay) {
        void attemptPlayWithSound();
      }
    };

    const onPlay = () => {
      if (cancelled) return;
      setIsPlaying(true);
      setIsBuffering(false);
      setAutoplayBlocked(false);
      setPlaybackConfirmed(true);
      onPlaybackConfirmedRef.current();
    };

    const onPause = () => {
      if (!cancelled) setIsPlaying(false);
    };

    const onWaiting = () => {
      if (!cancelled) setIsBuffering(true);
    };

    const onCanPlay = () => {
      if (!cancelled) setIsBuffering(false);
    };

    const onVolumeChange = () => {
      if (cancelled) return;
      setIsMuted(video.muted);
      setVolume(video.volume);
    };

    const onTimeUpdate = () => {
      if (cancelled) return;
      onPositionUpdateRef.current(Math.floor(video.currentTime));

      // Verify genuine audio decoding once stream has progressed >= 2s
      if (!audioVerifyTriggered && video.currentTime >= 2) {
        audioVerifyTriggered = true;
        const diag = detectVideoElementAudioState(video);
        if (diag.hasPlayableAudio === false) {
          setAudioDiagnosticNote('No audio track detected in current stream');
          handleNativeStreamFailure(
            diag.reason || `${provider?.name || 'Stream'} has no playable audio track.`
          );
        }
      }
    };

    const onVideoError = () => {
      if (cancelled) return;
      setIsBuffering(false);
      handleNativeStreamFailure(`${provider?.name || 'Direct video'} failed to decode media stream.`);
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('playing', onCanPlay);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('error', onVideoError);

    const isM3u8 =
      directMediaUrl.toLowerCase().includes('.m3u8') || source?.format === 'hls';

    if (isM3u8 && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startPosition: startSeconds > 0 ? startSeconds : -1,
      });
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_LOADED, (_evt, data: any) => {
        if (cancelled) return;
        const rawManifest = typeof data?.networkDetails?.responseText === 'string'
          ? data.networkDetails.responseText
          : null;
        if (rawManifest) {
          const inspection = inspectHlsManifest(rawManifest, directMediaUrl);
          if (inspection.hasAudio === 'no') {
            manifestReportedNoAudio = true;
            setAudioDiagnosticNote(inspection.reason || 'Video-only HLS stream');
            handleNativeStreamFailure(
              inspection.reason || `${provider?.name || 'HLS stream'} contains video only with no audio track.`
            );
          } else if (inspection.hasSeparateAudioPlaylist) {
            setAudioDiagnosticNote('Synced separate HLS audio rendition');
          }
        }
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data: any) => {
        if (cancelled) return;
        const tracks = Array.isArray(data?.audioTracks) ? data.audioTracks : hls?.audioTracks || [];
        syncAudioTrackList(tracks);

        const rawLevels = Array.isArray(data?.levels) ? data.levels : hls?.levels || [];
        const parsedLevels = rawLevels.map((lvl: any, idx: number) => ({
          index: idx,
          height: typeof lvl?.height === 'number' ? lvl.height : undefined,
          label: lvl?.height
            ? `${lvl.height}p`
            : lvl?.bitrate
              ? `${Math.round(lvl.bitrate / 1000)}kbps`
              : `Quality ${idx + 1}`,
        }));
        setQualityOptions(parsedLevels);
        setActiveQualityIndex(hls ? hls.currentLevel : -1);

        frameLoadedRef.current = true;
        setFrameLoaded(true);
        setIsBuffering(false);
        applySubtitlePreference();
        onFrameLoadedRef.current();
        if (autoPlay) {
          void attemptPlayWithSound();
        }
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_evt, data: any) => {
        if (!cancelled && Array.isArray(data?.audioTracks)) {
          syncAudioTrackList(data.audioTracks);
        }
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_evt, data: any) => {
        if (!cancelled && typeof data?.id === 'number') {
          setActiveAudioTrackId(data.id);
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data: any) => {
        if (!cancelled && typeof data?.level === 'number' && hls?.manualLevel !== -1) {
          setActiveQualityIndex(data.level);
        }
      });

      hls.on(Hls.Events.ERROR, (_evt, data: any) => {
        if (cancelled) return;
        const details = String(data?.details || '');
        const httpCode = Number(data?.response?.code || 0);
        const isExpiredToken =
          httpCode === 401 ||
          httpCode === 403 ||
          httpCode === 410 ||
          details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
          details === Hls.ErrorDetails.LEVEL_LOAD_ERROR ||
          details === Hls.ErrorDetails.FRAG_LOAD_ERROR;

        if (
          isExpiredToken &&
          source?.refreshable &&
          onRefreshSourceRef.current &&
          !tokenRefreshTriedRef.current
        ) {
          tokenRefreshTriedRef.current = true;
          setIsBuffering(true);
          setAudioDiagnosticNote('Refreshing signed stream link...');
          void onRefreshSourceRef.current()
            .then((refreshed) => {
              if (!cancelled && refreshed) {
                setInternalRefreshNonce((n) => n + 1);
              } else if (!cancelled) {
                handleNativeStreamFailure(
                  `${provider?.name || 'Stream'} signed token expired and could not be refreshed.`
                );
              }
            })
            .catch(() => {
              if (!cancelled) {
                handleNativeStreamFailure(
                  `${provider?.name || 'Stream'} signed token expired and could not be refreshed.`
                );
              }
            });
          return;
        }

        const isAudioError =
          details.toLowerCase().includes('audio') ||
          details === Hls.ErrorDetails.BUFFER_ADD_CODEC_ERROR;

        if (data?.fatal || isAudioError) {
          if (isAudioError) {
            setAudioDiagnosticNote(`Audio stream error (${details})`);
            handleNativeStreamFailure(
              `${provider?.name || 'Stream'} audio track failed to load (${details}).`
            );
          } else {
            handleNativeStreamFailure(
              `${provider?.name || 'HLS playback'} failed (${details || 'fatal media error'}).`
            );
          }
        }
      });

      const bustUrl =
        internalRefreshNonce > 0
          ? `${directMediaUrl}${directMediaUrl.includes('?') ? '&' : '?'}refresh=1&t=${internalRefreshNonce}`
          : directMediaUrl;
      hls.loadSource(bustUrl);
      hls.attachMedia(video);
    } else if (isM3u8 && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = directMediaUrl;
    } else {
      video.src = directMediaUrl;
    }

    return () => {
      cancelled = true;
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('playing', onCanPlay);
      video.removeEventListener('volumechange', onVolumeChange);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('error', onVideoError);

      if (hls) {
        hls.destroy();
      }
      hlsRef.current = null;

      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        // Ignore teardown errors
      }
    };
  }, [useNativeVideoMode, directMediaUrl, language, reloadNonce, internalRefreshNonce, source?.format]);

  // Apply mute & volume changes cleanly to active <video> without recreating HLS instance
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !useNativeVideoMode) return;
    video.muted = isMuted;
    video.volume = volume;
    try {
      if (volume > 0) {
        localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
      }
    } catch {
      // Ignore storage error
    }
  }, [isMuted, volume, useNativeVideoMode]);

  // Apply subtitle preference cleanly without recreating HLS instance
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !useNativeVideoMode || !video.textTracks) return;
    const pref = selectedSubtitle.trim().toLowerCase();
    for (let i = 0; i < video.textTracks.length; i += 1) {
      const track = video.textTracks[i];
      const label = (track.label || '').trim().toLowerCase();
      track.mode = pref === 'off' || pref === 'none' ? 'disabled' : label === pref ? 'showing' : 'disabled';
    }
    try {
      localStorage.setItem(SUBTITLE_STORAGE_KEY, selectedSubtitle);
    } catch {
      // Ignore storage error
    }
  }, [selectedSubtitle, useNativeVideoMode, source?.subtitles]);

  const iframeKey = `${provider?.key || 'none'}:${episode}:${language}:${embedUrl || 'empty'}:${reloadNonce}`;

  // Clear the PREVIOUS/UNMOUNTED iframe safely without touching a newly mounted iframeRef.current
  useEffect(() => {
    const capturedFrame = iframeRef.current;
    return () => {
      if (capturedFrame && capturedFrame !== iframeRef.current) {
        try {
          capturedFrame.src = 'about:blank';
        } catch {
          // Ignore teardown error
        }
      } else if (capturedFrame && !iframeRef.current) {
        try {
          capturedFrame.src = 'about:blank';
        } catch {
          // Ignore teardown error
        }
      }
    };
  }, [iframeKey, useNativeVideoMode]);

  // Listen for valid same-origin embed messages from sandboxed iframe (Yenime & AniEmbed schemas)
  useEffect(() => {
    if (useNativeVideoMode || !embedUrl || streamError) return;

    let expectedOrigin = '';
    try {
      expectedOrigin = new URL(embedUrl).origin;
    } catch {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (!iframeRef.current?.contentWindow || event.source !== iframeRef.current.contentWindow) {
        return;
      }
      if (event.origin !== expectedOrigin) {
        return;
      }

      const payload = safeParseMessageData(event.data);
      if (!payload) return;

      const nested =
        payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
          ? (payload.data as Record<string, any>)
          : null;

      let rawEventType = '';
      if (payload.source === 'aniembed' && String(payload.type || '').toLowerCase() === 'event') {
        rawEventType = String(payload.name || '');
      } else if (String(payload.type || '').toUpperCase() === 'PLAYER_EVENT' && nested?.event) {
        rawEventType = String(nested.event || '');
      } else {
        rawEventType = String(payload.type || payload.event || payload.name || '');
      }
      const eventType = rawEventType.toLowerCase();

      const rawTime =
        payload.currentTime ??
        payload.time ??
        payload.position ??
        nested?.currentTime ??
        nested?.time ??
        nested?.position;
      if (typeof rawTime === 'number' && Number.isFinite(rawTime) && rawTime >= 0) {
        onPositionUpdateRef.current(Math.floor(rawTime));
      }

      if (
        eventType === 'pause' ||
        eventType === 'paused' ||
        eventType === 'waiting' ||
        eventType === 'buffering' ||
        eventType === 'seeked' ||
        eventType === 'ended' ||
        eventType === 'settingschange' ||
        eventType === 'providerchange'
      ) {
        return;
      }

      if (
        eventType === 'play' ||
        eventType === 'playing' ||
        eventType === 'timeupdate' ||
        eventType === 'progress' ||
        eventType === 'ready' ||
        eventType === 'canplay'
      ) {
        setPlaybackConfirmed(true);
        onPlaybackConfirmedRef.current();
        return;
      }

      if (
        eventType === 'error' ||
        eventType === 'fatal' ||
        eventType === 'stream_error' ||
        eventType === 'unavailable' ||
        payload.fatal === true ||
        nested?.fatal === true
      ) {
        const errText = nested?.message ?? nested?.error ?? payload.message;
        const msg =
          typeof errText === 'string' && errText.trim()
            ? errText
            : `${provider?.name || 'Playback server'} reported a playback error`;
        triggerFailureOnce(msg);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [useNativeVideoMode, embedUrl, provider?.key, streamError]);

  const handleTogglePlay = async () => {
    const video = videoRef.current;
    if (!video || !useNativeVideoMode) return;
    if (video.paused) {
      try {
        await video.play();
        setAutoplayBlocked(false);
        setIsPlaying(true);
      } catch (err: any) {
        if (err?.name === 'NotAllowedError') {
          setAutoplayBlocked(true);
        }
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handlePlayWithSound = async () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setIsMuted(false);
    if (volume === 0) {
      video.volume = 1;
      setVolume(1);
    }
    try {
      await video.play();
      setAutoplayBlocked(false);
      setIsPlaying(true);
    } catch {
      setAutoplayBlocked(true);
    }
  };

  const handleSelectAudioTrack = (trackId: number) => {
    setActiveAudioTrackId(trackId);
    if (hlsRef.current) {
      hlsRef.current.audioTrack = trackId;
    }
  };

  const handleSelectQuality = (levelIndex: number) => {
    setActiveQualityIndex(levelIndex);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
  };

  const handleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else {
      void el.requestFullscreen?.();
    }
  };

  const shortcutRef = useRef({
    useNativeVideoMode,
    hasPrevEpisode,
    hasNextEpisode,
    handleTogglePlay,
    handleFullscreen,
    onPrevEpisode,
    onNextEpisode,
  });

  useEffect(() => {
    shortcutRef.current = {
      useNativeVideoMode,
      hasPrevEpisode,
      hasNextEpisode,
      handleTogglePlay,
      handleFullscreen,
      onPrevEpisode,
      onNextEpisode,
    };
  }, [
    useNativeVideoMode,
    hasPrevEpisode,
    hasNextEpisode,
    handleTogglePlay,
    handleFullscreen,
    onPrevEpisode,
    onNextEpisode,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable
      ) {
        return;
      }
      const ctx = shortcutRef.current;
      const key = e.key.toLowerCase();

      if (key === 'f') {
        e.preventDefault();
        ctx.handleFullscreen();
        return;
      }
      if (e.shiftKey && e.key === 'ArrowLeft' && ctx.hasPrevEpisode) {
        e.preventDefault();
        ctx.onPrevEpisode();
        return;
      }
      if (e.shiftKey && e.key === 'ArrowRight' && ctx.hasNextEpisode) {
        e.preventDefault();
        ctx.onNextEpisode();
        return;
      }
      if (!ctx.useNativeVideoMode) return;
      if (key === 'k' || (e.key === ' ' && tag !== 'button' && tag !== 'a')) {
        e.preventDefault();
        void ctx.handleTogglePlay();
      } else if (key === 'm') {
        e.preventDefault();
        setIsMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const serverLabel = provider
    ? `${serverRole === 'primary' ? 'Primary' : 'Backup'}: ${provider.name}`
    : 'No active server';

  const statusText = streamError
    ? 'Unavailable'
    : loadingStream
      ? loadingStatusText || 'Checking streaming providers...'
      : !frameLoaded
        ? 'Connecting to player...'
        : isBuffering
          ? 'Buffering...'
          : playbackConfirmed
            ? useNativeVideoMode
              ? isMuted
                ? 'Playing · Muted'
                : 'Playing · Audio Active'
              : 'Playing · Confirmed'
            : 'Player Loaded';

  const safeExternalUrl = useMemo(() => {
    if (!embedUrl) return null;
    try {
      const parsed = new URL(embedUrl);
      return parsed.protocol === 'https:' ? parsed.toString() : null;
    } catch {
      return null;
    }
  }, [embedUrl]);

  return (
    <div className="space-y-3">
      {failoverNotice && !streamError && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-700 dark:text-amber-300"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{failoverNotice}</span>
        </div>
      )}

      {/* Cinema 16:9 Stage (isolated stacking context so overlays never block page navigation) */}
      <div
        ref={containerRef}
        className="group/stage relative isolate aspect-video w-full overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-black shadow-2xl"
      >
        {(loadingStream || (activeUrl && !frameLoaded && !streamError)) && (
          <div className="av-backdrop-enter absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#09090F]/95 text-center p-6 pointer-events-none">
            <Loader2 className="h-8 w-8 animate-spin text-[#9B87FF] mb-3" />
            <p className="text-sm font-medium text-[#F5F3FF]">
              {loadingStream
                ? loadingStatusText || 'Checking streaming providers...'
                : `Loading Episode ${episode} (${language.toUpperCase()})`}
            </p>
            <p className="text-xs text-[#A5A1B5] mt-1">{serverLabel}</p>
          </div>
        )}

        {useNativeVideoMode && frameLoaded && isBuffering && !streamError && (
          <div className="av-modal-enter absolute top-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-lg bg-black/75 border border-white/10 px-3 py-1 text-[11px] font-medium text-[#F5F3FF] pointer-events-none">
            <Loader2 className="h-3 w-3 animate-spin text-[#9B87FF]" />
            <span>Buffering...</span>
          </div>
        )}

        {/* Compact Fullscreen & Stage Stream Provider Switcher */}
        {onSelectProvider && availableProviders.length > 1 && !streamError && !loadingStream && (
          <div
            role="group"
            aria-label="Quick switch stream provider"
            className="av-touch-actions absolute top-3 right-3 z-20 flex items-center gap-1 rounded-lg bg-[#09090F]/80 backdrop-blur-md border border-white/15 p-1 text-[11px] opacity-80 md:opacity-45 md:group-hover/stage:opacity-100 md:focus-within:opacity-100 transition-opacity duration-200"
          >
            <Server className="h-3 w-3 text-[#9B87FF] ml-1 shrink-0" aria-hidden="true" />
            {availableProviders
              .filter((opt) => opt.status !== 'disabled' && opt.status !== 'unsupported_audio')
              .map((opt) => {
                const isSelected = source?.providerKey === opt.key || selectedProviderKey === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={Boolean(switchingProvider)}
                    aria-pressed={isSelected}
                    onClick={() => onSelectProvider(opt.key)}
                    className={`av-btn-press rounded-md px-2 py-1 font-medium whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#9B87FF] ${
                      isSelected
                        ? 'bg-[#7C5CFF] text-white'
                        : 'text-[#F5F3FF]/85 hover:bg-white/10 hover:text-white'
                    } disabled:opacity-50`}
                  >
                    {opt.name}
                  </button>
                );
              })}
          </div>
        )}

        {/* Autoplay blocked by browser policy -> explicit user gesture to play unmuted */}
        {useNativeVideoMode && autoplayBlocked && !streamError && (
          <div className="av-backdrop-enter absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#09090F]/80 p-6 text-center backdrop-blur-sm">
            <button
              type="button"
              onClick={handlePlayWithSound}
              className="av-btn-press inline-flex items-center gap-2 rounded-xl bg-[#7C5CFF] hover:bg-[#9B87FF] px-5 py-3 text-sm font-semibold text-white shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
            >
              <Volume2 className="h-4 w-4" />
              Play with sound
            </button>
            <p className="mt-2.5 text-xs text-[#A5A1B5] max-w-sm">
              Browser autoplay policy requires a click to start unmuted audio playback.
            </p>
          </div>
        )}

        {(streamError || (!loadingStream && !activeUrl)) && (
          <div className="av-backdrop-enter absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#09090F] p-6 text-center">
            <div className="h-11 w-11 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center mb-3">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-[#F5F3FF] mb-1">Playback Unavailable</h3>
            <p className="text-sm text-[#A5A1B5] max-w-md mb-5">
              {streamError ||
                'No playable audio/video source is available from current providers.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={onRetry}
                className="av-btn-press inline-flex items-center gap-1.5 rounded-lg bg-[#7C5CFF] hover:bg-[#9B87FF] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </button>
              {onSelectProvider &&
                availableProviders
                  .filter(
                    (opt) =>
                      opt.key !== provider?.key &&
                      opt.status !== 'disabled' &&
                      opt.status !== 'unsupported_audio'
                  )
                  .map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      disabled={switchingProvider}
                      onClick={() => onSelectProvider(opt.key)}
                      className="av-btn-press inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3.5 py-2 text-xs font-medium text-[#F5F3FF] disabled:opacity-50 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
                    >
                      <Server className="h-3.5 w-3.5 text-[#9B87FF]" />
                      Switch to {opt.name}
                    </button>
                  ))}
              {safeExternalUrl && (
                <a
                  href={safeExternalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="av-btn-press inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3.5 py-2 text-xs font-medium text-[#F5F3FF] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Provider
                </a>
              )}
              {diagnosticReport && (
                <button
                  type="button"
                  aria-expanded={diagnosticsOpen}
                  onClick={() => setDiagnosticsOpen((v) => !v)}
                  className="av-btn-press inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3.5 py-2 text-xs font-medium text-[#F5F3FF] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
                >
                  <FileText className="h-3.5 w-3.5 text-[#9B87FF]" />
                  <span>Diagnostic Report</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${diagnosticsOpen ? 'rotate-180' : ''}`}
                  />
                </button>
              )}
            </div>
          </div>
        )}

        {useNativeVideoMode ? (
          <video
            ref={videoRef}
            controls
            playsInline
            preload="metadata"
            crossOrigin="anonymous"
            className="h-full w-full bg-black"
          >
            {(() => {
              const subs = source?.subtitles || [];
              const pref = selectedSubtitle.trim().toLowerCase();
              const isOff = pref === 'off' || pref === 'none';
              const exactIdx = subs.findIndex((s) => s.label.trim().toLowerCase() === pref);
              const englishIdx = subs.findIndex((s) => s.label.toLowerCase().includes('english'));
              const activeIdx = isOff ? -1 : exactIdx >= 0 ? exactIdx : englishIdx >= 0 ? englishIdx : 0;
              return subs.map((sub, idx) => (
                <track
                  key={`${sub.file}-${idx}`}
                  src={sub.file}
                  label={sub.label}
                  kind={sub.kind === 'captions' ? 'captions' : 'subtitles'}
                  default={idx === activeIdx}
                />
              ));
            })()}
          </video>
        ) : (
          embedUrl &&
          !streamError && (
            <iframe
              ref={iframeRef}
              key={iframeKey}
              src={embedUrl}
              title={`${title} Episode ${episode} — ${provider?.name || 'Unified Player'}`}
              loading="eager"
              className="h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope; screen-wake-lock"
              referrerPolicy="origin"
              onLoad={() => {
                frameLoadedRef.current = true;
                setFrameLoaded(true);
                onFrameLoadedRef.current();
              }}
              onError={() => {
                triggerFailureOnce(`${provider?.name || 'Playback server'} iframe failed to load`);
              }}
            />
          )
        )}
      </div>

      {/* Unified Cinema Control Strip + Stream Provider Bar */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#11111B] text-xs overflow-hidden">
        {onSelectProvider && availableProviders.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-2.5 border-b border-zinc-200 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-[#141420]">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-[#A5A1B5] whitespace-nowrap shrink-0">
                <Server className="h-3.5 w-3.5 text-[#9B87FF]" />
                Stream Provider
              </span>
              <div
                role="group"
                aria-label="Choose stream provider"
                className="flex flex-wrap items-center gap-1.5"
              >
                {availableProviders.map((opt) => {
                  const isActiveSource = source?.providerKey === opt.key && !streamError;
                  const isSelected = isActiveSource || (!source && selectedProviderKey === opt.key);
                  const isUnavailable =
                    opt.status === 'disabled' || opt.status === 'unsupported_audio';
                  const isBusy = Boolean(switchingProvider);

                  const suffix =
                    opt.status === 'loading'
                      ? 'Loading'
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
                      onClick={() => onSelectProvider(opt.key)}
                      className={`av-btn-press inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
                        isSelected
                          ? 'border-[#7C5CFF] bg-[#7C5CFF] text-white'
                          : opt.status === 'failed'
                            ? 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:border-amber-400'
                            : 'border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] text-zinc-800 dark:text-[#F5F3FF] hover:border-[#9B87FF]'
                      } disabled:opacity-45 disabled:cursor-not-allowed`}
                    >
                      {opt.status === 'loading' && (
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

            {source?.serverLabel && !streamError && (
              <span className="text-[11px] text-zinc-500 dark:text-[#A5A1B5] tabular-nums whitespace-nowrap">
                {source.serverLabel}
                {typeof source.latencyMs === 'number' ? ` · ${source.latencyMs}ms` : ''}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2.5 text-zinc-600 dark:text-[#A5A1B5]">
          <span className="inline-flex items-center gap-1.5 font-medium text-zinc-900 dark:text-[#F5F3FF]">
            <Radio
              className={`h-3.5 w-3.5 ${
                streamError
                  ? 'text-rose-500'
                  : playbackConfirmed
                    ? 'text-emerald-400'
                    : frameLoaded
                      ? 'text-[#9B87FF]'
                      : 'text-amber-400'
              }`}
            />
            <span>{serverLabel}</span>
            <span aria-hidden="true" className="text-zinc-400 dark:text-[#A5A1B5]/50">
              ·
            </span>
            <span className="text-zinc-500 dark:text-[#A5A1B5] font-normal">{statusText}</span>
          </span>

          {audioDiagnosticNote && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-[11px] text-[#7C5CFF] dark:text-[#9B87FF]">
                {audioDiagnosticNote}
              </span>
            </>
          )}

          {!useNativeVideoMode && frameLoaded && !streamError && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-[11px] text-zinc-500 dark:text-[#A5A1B5]">
                Embed sandbox active (popups &amp; top redirects blocked)
              </span>
            </>
          )}

          {startSeconds > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums text-[#7C5CFF] dark:text-[#9B87FF] font-medium">
                Position {formatSeconds(startSeconds)}
              </span>
              <button
                type="button"
                onClick={onResetStart}
                className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-[#F5F3FF] whitespace-nowrap"
              >
                Restart 0:00
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Native Video Play + Audio & Volume Controls */}
          {useNativeVideoMode && (
            <>
              <button
                type="button"
                onClick={handleTogglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="av-btn-press inline-flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-[#171722] border border-transparent dark:border-white/[0.06] px-2.5 py-1.5 font-medium text-zinc-900 dark:text-[#F5F3FF] hover:bg-zinc-200 dark:hover:bg-[#20202D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>

              <div className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 dark:bg-[#171722] border border-transparent dark:border-white/[0.06] px-2 py-1">
                <button
                  type="button"
                  onClick={() => setIsMuted((m) => !m)}
                  aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
                  className="text-zinc-700 dark:text-[#F5F3FF] hover:text-[#9B87FF]"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="h-3.5 w-3.5 text-rose-400" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5 text-[#9B87FF]" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  aria-label="Volume"
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setVolume(next);
                    if (next > 0 && isMuted) setIsMuted(false);
                    if (next === 0) setIsMuted(true);
                  }}
                  className="w-16 accent-[#9B87FF] cursor-pointer"
                />
              </div>

              {audioTracks.length > 0 && (
                <select
                  aria-label="Stream audio track"
                  value={activeAudioTrackId}
                  onChange={(e) => handleSelectAudioTrack(Number(e.target.value))}
                  className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-100 dark:bg-[#171722] px-2 py-1 text-[11px] font-medium text-zinc-800 dark:text-[#F5F3FF]"
                >
                  {audioTracks.map((t, idx) => (
                    <option key={t.id} value={t.id}>
                      {formatAudioTrackLabel(t, idx)}
                    </option>
                  ))}
                </select>
              )}

              {qualityOptions.length > 0 && (
                <label className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-100 dark:bg-[#171722] px-2 py-1 text-[11px] font-medium text-zinc-800 dark:text-[#F5F3FF]">
                  <SlidersHorizontal className="h-3 w-3 text-[#9B87FF]" />
                  <select
                    aria-label="Video quality"
                    value={activeQualityIndex}
                    onChange={(e) => handleSelectQuality(Number(e.target.value))}
                    className="bg-transparent outline-none cursor-pointer"
                  >
                    <option value={-1} className="bg-[#171722]">
                      Auto
                    </option>
                    {qualityOptions.map((q) => (
                      <option key={q.index} value={q.index} className="bg-[#171722]">
                        {q.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {source?.subtitles && source.subtitles.length > 0 && (
                <label className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-100 dark:bg-[#171722] px-2 py-1 text-[11px] font-medium text-zinc-800 dark:text-[#F5F3FF]">
                  <Subtitles className="h-3 w-3 text-[#9B87FF]" />
                  <select
                    aria-label="Subtitle language"
                    value={selectedSubtitle}
                    onChange={(e) => setSelectedSubtitle(e.target.value)}
                    className="bg-transparent outline-none cursor-pointer"
                  >
                    <option value="off" className="bg-[#171722]">
                      CC Off
                    </option>
                    {source.subtitles.map((sub, idx) => (
                      <option key={`${sub.file}-${idx}`} value={sub.label} className="bg-[#171722]">
                        {sub.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}

          {/* SUB / DUB Toggle */}
          <div
            role="group"
            aria-label="Audio track"
            className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-zinc-100 dark:bg-[#171722] p-0.5"
          >
            {(['sub', 'dub'] as const).map((track) => {
              const supported = provider ? provider.supportsTrack(track) : true;
              const active = language === track;
              return (
                <button
                  key={track}
                  type="button"
                  disabled={!supported}
                  onClick={() => onSelectLanguage(track)}
                  className={`av-btn-press rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#9B87FF] ${
                    active
                      ? 'bg-[#7C5CFF] text-white'
                      : 'text-zinc-600 dark:text-[#A5A1B5] hover:text-zinc-900 dark:hover:text-[#F5F3FF] disabled:opacity-40'
                  }`}
                >
                  {track}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={!hasPrevEpisode}
            onClick={onPrevEpisode}
            className="av-btn-press inline-flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-[#171722] border border-transparent dark:border-white/[0.06] px-2.5 py-1.5 font-medium text-zinc-900 dark:text-[#F5F3FF] hover:bg-zinc-200 dark:hover:bg-[#20202D] disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev Ep
          </button>

          <button
            type="button"
            disabled={!hasNextEpisode}
            onClick={onNextEpisode}
            className="av-btn-press inline-flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-[#171722] border border-transparent dark:border-white/[0.06] px-2.5 py-1.5 font-medium text-zinc-900 dark:text-[#F5F3FF] hover:bg-zinc-200 dark:hover:bg-[#20202D] disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
          >
            Next Ep
            <ChevronRight className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onToggleAutoPlay}
            className={`av-btn-press rounded-lg px-2.5 py-1.5 font-medium whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF] ${
              autoPlay
                ? 'bg-[#7C5CFF]/15 text-[#7C5CFF] dark:text-[#9B87FF]'
                : 'text-zinc-600 dark:text-[#A5A1B5] hover:bg-zinc-100 dark:hover:bg-[#171722]'
            }`}
          >
            Autoplay: {autoPlay ? 'On' : 'Off'}
          </button>

          {safeExternalUrl && (
            <a
              href={safeExternalUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open verified provider in a separate tab"
              className="av-btn-press inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-zinc-600 dark:text-[#A5A1B5] hover:bg-zinc-100 dark:hover:bg-[#171722] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Open Provider</span>
            </a>
          )}

          <button
            type="button"
            onClick={handleFullscreen}
            aria-label="Toggle fullscreen (F)"
            title="Toggle fullscreen (F)"
            className="av-btn-press inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-zinc-600 dark:text-[#A5A1B5] hover:bg-zinc-100 dark:hover:bg-[#171722] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Fullscreen</span>
          </button>

          {diagnosticReport && (
            <button
              type="button"
              aria-expanded={diagnosticsOpen}
              onClick={() => setDiagnosticsOpen((v) => !v)}
              className="av-btn-press inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-zinc-600 dark:text-[#A5A1B5] hover:bg-zinc-100 dark:hover:bg-[#171722] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
            >
              <FileText className="h-3.5 w-3.5 text-[#9B87FF]" />
              <span className="hidden sm:inline">Diagnostics</span>
            </button>
          )}
        </div>
        </div>

        {diagnosticReport && diagnosticsOpen && (
          <div className="av-modal-enter border-t border-zinc-200 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-[#0E0E17] px-4 py-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                  Playback Diagnostic Report
                </h4>
                <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5] font-mono tabular-nums mt-0.5">
                  AniList #{diagnosticReport.anilistId}
                  {diagnosticReport.malId ? ` · MAL #${diagnosticReport.malId}` : ''} · Ep{' '}
                  {diagnosticReport.episodeNumber} · {diagnosticReport.audioTrack.toUpperCase()} ·{' '}
                  {new Date(diagnosticReport.generatedAt).toLocaleTimeString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyDiagnostics()}
                className="av-btn-press inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-[#171722] px-3 py-1.5 text-[11px] font-medium text-zinc-800 dark:text-[#F5F3FF] hover:border-[#9B87FF] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9B87FF]"
              >
                {copiedDiagnostics ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    Copied Summary
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-[#9B87FF]" />
                    Copy Summary
                  </>
                )}
              </button>
            </div>

            <p className="text-[11px] text-zinc-700 dark:text-[#F5F3FF]/85">
              {diagnosticReport.suggestedAction}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {diagnosticReport.attemptedProviders.map((attempt) => (
                <div
                  key={`${attempt.providerKey}-${attempt.stage}`}
                  className="rounded-lg border border-zinc-200 dark:border-white/[0.08] bg-white dark:bg-[#171722] px-3 py-2 space-y-0.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-zinc-900 dark:text-[#F5F3FF]">
                      {attempt.providerName}
                    </span>
                    <span
                      className={`font-mono uppercase ${
                        attempt.errorCategory === 'none'
                          ? 'text-emerald-500'
                          : attempt.errorCategory === 'disabled' ||
                              attempt.errorCategory === 'unsupported_audio'
                            ? 'text-amber-500'
                            : 'text-rose-500'
                      }`}
                    >
                      {attempt.errorCategory}
                      {attempt.httpStatus ? ` (${attempt.httpStatus})` : ''} · {attempt.latencyMs}ms
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-[#A5A1B5] leading-snug">
                    {attempt.message}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
