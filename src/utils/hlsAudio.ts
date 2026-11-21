export interface HlsAudioRendition {
  groupId: string;
  name: string;
  language: string | null;
  isDefault: boolean;
  autoSelect: boolean;
  uri: string | null;
  channels: string | null;
}

export interface HlsVariantStream {
  bandwidth: number | null;
  resolution: string | null;
  codecs: string[];
  audioGroupId: string | null;
  uri: string;
  hasAudioCodec: boolean;
  isVideoOnlyCodec: boolean;
}

export interface HlsManifestInspection {
  validM3u8: boolean;
  isMaster: boolean;
  audioRenditions: HlsAudioRendition[];
  variants: HlsVariantStream[];
  hasSeparateAudioPlaylist: boolean;
  hasAudio: 'yes' | 'no' | 'unknown';
  reason: string | null;
}

const AUDIO_CODEC_PREFIXES = ['mp4a', 'ac-3', 'ec-3', 'opus', 'flac', 'vorbis', 'mp3', 'alac', 'dtsc', 'dtse'];
const VIDEO_CODEC_PREFIXES = ['avc1', 'avc3', 'hev1', 'hvc1', 'vp08', 'vp09', 'vp8', 'vp9', 'av01', 'mp4v'];

function isAudioCodecToken(codec: string): boolean {
  const lower = codec.trim().toLowerCase();
  return AUDIO_CODEC_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function isVideoCodecToken(codec: string): boolean {
  const lower = codec.trim().toLowerCase();
  return VIDEO_CODEC_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function parseHlsAttributeList(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  const regex = /([A-Z0-9-]+)=("([^"]*)"|[^,]*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const key = match[1];
    const value = match[3] !== undefined ? match[3] : match[2];
    result[key] = value.trim();
  }
  return result;
}

function resolveMaybeRelativeUrl(uri: string | undefined, baseUrl?: string): string | null {
  if (!uri) return null;
  const trimmed = uri.trim();
  if (!trimmed) return null;
  if (!baseUrl) return trimmed;
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return trimmed;
  }
}

export function inspectHlsManifest(
  manifestText: string,
  manifestUrl?: string
): HlsManifestInspection {
  if (!manifestText || !manifestText.includes('#EXTM3U')) {
    return {
      validM3u8: false,
      isMaster: false,
      audioRenditions: [],
      variants: [],
      hasSeparateAudioPlaylist: false,
      hasAudio: 'unknown',
      reason: 'Manifest is not a valid #EXTM3U playlist.',
    };
  }

  const lines = manifestText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const audioRenditions: HlsAudioRendition[] = [];
  const variants: HlsVariantStream[] = [];
  let isMaster = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('#EXT-X-MEDIA:')) {
      const attrs = parseHlsAttributeList(line.slice('#EXT-X-MEDIA:'.length));
      if ((attrs.TYPE || '').toUpperCase() === 'AUDIO') {
        isMaster = true;
        audioRenditions.push({
          groupId: attrs['GROUP-ID'] || 'default',
          name: attrs.NAME || attrs.LANGUAGE || 'Audio',
          language: attrs.LANGUAGE ? attrs.LANGUAGE.toLowerCase() : null,
          isDefault: (attrs.DEFAULT || '').toUpperCase() === 'YES',
          autoSelect: (attrs.AUTOSELECT || '').toUpperCase() === 'YES',
          uri: resolveMaybeRelativeUrl(attrs.URI, manifestUrl),
          channels: attrs.CHANNELS || null,
        });
      }
      continue;
    }

    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      isMaster = true;
      const attrs = parseHlsAttributeList(line.slice('#EXT-X-STREAM-INF:'.length));
      const nextLine = lines[i + 1] && !lines[i + 1].startsWith('#') ? lines[i + 1] : '';
      const codecs = (attrs.CODECS || '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      const hasAudioCodec = codecs.some(isAudioCodecToken);
      const hasVideoCodec = codecs.some(isVideoCodecToken);
      const isVideoOnlyCodec = codecs.length > 0 && hasVideoCodec && !hasAudioCodec;

      variants.push({
        bandwidth: attrs.BANDWIDTH ? Number(attrs.BANDWIDTH) : null,
        resolution: attrs.RESOLUTION || null,
        codecs,
        audioGroupId: attrs.AUDIO || null,
        uri: resolveMaybeRelativeUrl(nextLine, manifestUrl) || nextLine,
        hasAudioCodec,
        isVideoOnlyCodec,
      });
    }
  }

  const hasSeparateAudioPlaylist = audioRenditions.some((r) => Boolean(r.uri));

  if (!isMaster) {
    // Raw media playlist: cannot guarantee audio without container/MSE probing unless explicitly empty
    const hasSegments = lines.some((l) => !l.startsWith('#'));
    return {
      validM3u8: true,
      isMaster: false,
      audioRenditions: [],
      variants: [],
      hasSeparateAudioPlaylist: false,
      hasAudio: hasSegments ? 'unknown' : 'no',
      reason: hasSegments ? null : 'Media playlist contains no segments.',
    };
  }

  // Master playlist evaluation:
  // 1. If explicit TYPE=AUDIO renditions exist, check if any referenced AUDIO group actually has renditions
  if (audioRenditions.length > 0) {
    return {
      validM3u8: true,
      isMaster: true,
      audioRenditions,
      variants,
      hasSeparateAudioPlaylist,
      hasAudio: 'yes',
      reason: null,
    };
  }

  // 2. If any variant explicitly lists an audio codec, stream carries muxed audio
  if (variants.some((v) => v.hasAudioCodec)) {
    return {
      validM3u8: true,
      isMaster: true,
      audioRenditions,
      variants,
      hasSeparateAudioPlaylist: false,
      hasAudio: 'yes',
      reason: null,
    };
  }

  // 3. If ALL variants declare CODECS and NONE contain an audio codec AND there are 0 TYPE=AUDIO renditions -> video-only!
  const allDeclareCodecs = variants.length > 0 && variants.every((v) => v.codecs.length > 0);
  if (allDeclareCodecs && variants.every((v) => v.isVideoOnlyCodec)) {
    return {
      validM3u8: true,
      isMaster: true,
      audioRenditions,
      variants,
      hasSeparateAudioPlaylist: false,
      hasAudio: 'no',
      reason: 'HLS master playlist declares video-only codecs without any audio track.',
    };
  }

  // 4. Variant references AUDIO="..." group that does not exist in #EXT-X-MEDIA
  if (variants.length > 0 && variants.every((v) => Boolean(v.audioGroupId)) && audioRenditions.length === 0) {
    return {
      validM3u8: true,
      isMaster: true,
      audioRenditions,
      variants,
      hasSeparateAudioPlaylist: false,
      hasAudio: 'no',
      reason: 'HLS variants reference an AUDIO group, but no TYPE=AUDIO renditions are defined.',
    };
  }

  return {
    validM3u8: true,
    isMaster: true,
    audioRenditions,
    variants,
    hasSeparateAudioPlaylist,
    hasAudio: 'unknown',
    reason: null,
  };
}

export interface SelectableAudioTrack {
  id: number;
  name: string;
  lang?: string;
  default?: boolean;
}

export function pickPreferredAudioTrackIndex(
  tracks: SelectableAudioTrack[],
  desiredMode: 'sub' | 'dub'
): number {
  if (!Array.isArray(tracks) || tracks.length === 0) return -1;

  const matchesEnglish = (t: SelectableAudioTrack) => {
    const lang = (t.lang || '').toLowerCase();
    const name = (t.name || '').toLowerCase();
    return (
      lang === 'en' ||
      lang === 'eng' ||
      lang.startsWith('en-') ||
      name.includes('english') ||
      name.includes('dub')
    );
  };

  const matchesJapanese = (t: SelectableAudioTrack) => {
    const lang = (t.lang || '').toLowerCase();
    const name = (t.name || '').toLowerCase();
    return (
      lang === 'ja' ||
      lang === 'jpn' ||
      lang === 'jp' ||
      lang.startsWith('ja-') ||
      name.includes('japanese') ||
      name.includes('original') ||
      name.includes('sub')
    );
  };

  if (desiredMode === 'dub') {
    const eng = tracks.find(matchesEnglish);
    if (eng) return eng.id;
  } else {
    const jpn = tracks.find(matchesJapanese);
    if (jpn) return jpn.id;
  }

  const def = tracks.find((t) => t.default);
  return def ? def.id : tracks[0].id;
}

export function formatAudioTrackLabel(track: SelectableAudioTrack, index: number): string {
  const name = (track.name || '').trim();
  const lang = (track.lang || '').trim().toUpperCase();
  if (name && lang && !name.toUpperCase().includes(lang)) {
    return `${name} (${lang})`;
  }
  return name || lang || `Audio ${index + 1}`;
}

export interface VideoElementAudioDiagnostics {
  hasPlayableAudio: boolean | null;
  trackCount: number;
  muted: boolean;
  volume: number;
  decodedAudioBytes: number | null;
  reason?: string;
}

export function detectVideoElementAudioState(video: HTMLVideoElement): VideoElementAudioDiagnostics {
  const anyVideo = video as any;
  const muted = Boolean(video.muted);
  const volume = Number.isFinite(video.volume) ? video.volume : 1;

  // Safari / Chromium audioTracks list when exposed
  const audioTracks = anyVideo.audioTracks as { length: number } | undefined;
  if (audioTracks && typeof audioTracks.length === 'number') {
    if (audioTracks.length === 0 && video.readyState >= 1) {
      return {
        hasPlayableAudio: false,
        trackCount: 0,
        muted,
        volume,
        decodedAudioBytes: null,
        reason: 'Video stream contains 0 browser-detected audio tracks.',
      };
    }
    if (audioTracks.length > 0) {
      return {
        hasPlayableAudio: true,
        trackCount: audioTracks.length,
        muted,
        volume,
        decodedAudioBytes:
          typeof anyVideo.webkitAudioDecodedByteCount === 'number'
            ? anyVideo.webkitAudioDecodedByteCount
            : null,
      };
    }
  }

  if (typeof anyVideo.mozHasAudio === 'boolean') {
    return {
      hasPlayableAudio: anyVideo.mozHasAudio,
      trackCount: anyVideo.mozHasAudio ? 1 : 0,
      muted,
      volume,
      decodedAudioBytes: null,
      reason: anyVideo.mozHasAudio ? undefined : 'Stream has no audio track (mozHasAudio=false).',
    };
  }

  if (typeof anyVideo.webkitAudioDecodedByteCount === 'number') {
    const bytes = anyVideo.webkitAudioDecodedByteCount as number;
    // Only conclude "no audio" after at least ~2 seconds of active video playback with 0 decoded audio bytes
    if (video.currentTime >= 2 && bytes === 0) {
      return {
        hasPlayableAudio: false,
        trackCount: 0,
        muted,
        volume,
        decodedAudioBytes: 0,
        reason: 'Stream has progressed >2s with 0 decoded audio bytes (video-only or silent codec).',
      };
    }
    if (bytes > 0) {
      return {
        hasPlayableAudio: true,
        trackCount: 1,
        muted,
        volume,
        decodedAudioBytes: bytes,
      };
    }
  }

  return {
    hasPlayableAudio: null,
    trackCount: 0,
    muted,
    volume,
    decodedAudioBytes: null,
  };
}

export async function probeDirectMediaStream(
  streamUrl: string,
  signal?: AbortSignal,
  options?: { userAgent?: string }
): Promise<{
  accessible: boolean;
  corsAccessible: boolean;
  httpStatus: number;
  kind: 'hls' | 'mp4' | 'unknown';
  hasAudio: 'yes' | 'no' | 'unknown';
  manifest?: HlsManifestInspection;
  reason?: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(streamUrl);
  } catch {
    return {
      accessible: false,
      corsAccessible: false,
      httpStatus: 0,
      kind: 'unknown',
      hasAudio: 'unknown',
      reason: 'Invalid stream URL.',
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      accessible: false,
      corsAccessible: false,
      httpStatus: 0,
      kind: 'unknown',
      hasAudio: 'unknown',
      reason: 'Unsupported URL protocol.',
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    const headers: Record<string, string> = {
      Range: 'bytes=0-32767',
      Accept: 'application/vnd.apple.mpegurl, application/x-mpegurl, */*',
    };

    if (typeof window === 'undefined' && options?.userAgent) {
      headers['User-Agent'] = options.userAgent;
    }

    const res = await fetch(parsed.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers,
    }).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    });

    const acao = (res.headers.get('access-control-allow-origin') || '').trim();
    const corsAccessible = Boolean(acao && (acao === '*' || acao.startsWith('http')));

    if (!(res.status === 200 || res.status === 206)) {
      return {
        accessible: false,
        corsAccessible,
        httpStatus: res.status,
        kind: 'unknown',
        hasAudio: 'unknown',
        reason: `Upstream media returned HTTP ${res.status}.`,
      };
    }

    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html')) {
      return {
        accessible: false,
        corsAccessible,
        httpStatus: res.status,
        kind: 'unknown',
        hasAudio: 'unknown',
        reason: 'Upstream returned an HTML page instead of a media stream.',
      };
    }

    const looksLikeM3u8 =
      parsed.pathname.toLowerCase().includes('.m3u8') ||
      ct.includes('mpegurl');

    if (looksLikeM3u8) {
      const text = await res.text();
      if (!text.includes('#EXTM3U')) {
        return {
          accessible: false,
          corsAccessible,
          httpStatus: res.status,
          kind: 'hls',
          hasAudio: 'unknown',
          reason: 'Response does not contain an #EXTM3U playlist.',
        };
      }
      const inspection = inspectHlsManifest(text, parsed.toString());
      return {
        accessible: true,
        corsAccessible,
        httpStatus: res.status,
        kind: 'hls',
        hasAudio: inspection.hasAudio,
        manifest: inspection,
        reason: inspection.reason || undefined,
      };
    }

    if (ct.includes('video/mp4') || ct.includes('video/webm') || parsed.pathname.toLowerCase().endsWith('.mp4')) {
      return {
        accessible: true,
        corsAccessible,
        httpStatus: res.status,
        kind: 'mp4',
        hasAudio: 'unknown',
      };
    }

    return {
      accessible: false,
      corsAccessible,
      httpStatus: res.status,
      kind: 'unknown',
      hasAudio: 'unknown',
      reason: `Unrecognized media content-type (${ct || 'none'}).`,
    };
  } catch (err) {
    return {
      accessible: false,
      corsAccessible: false,
      httpStatus: 0,
      kind: 'unknown',
      hasAudio: 'unknown',
      reason: err instanceof Error ? err.message : 'Media accessibility check failed.',
    };
  }
}
