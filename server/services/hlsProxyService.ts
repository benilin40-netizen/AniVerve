import crypto from 'node:crypto';
import net from 'node:net';
import { cleanEnv } from '../utils/env.ts';
import { BROWSER_USER_AGENT, reliableFetch } from '../utils/httpClient.ts';

const EPHEMERAL_HMAC_SECRET = crypto.randomBytes(32).toString('hex');

function getProxySecret(): string {
  return (
    cleanEnv(process.env.HLS_PROXY_SECRET, '') ||
    cleanEnv(process.env.SESSION_SECRET, '') ||
    EPHEMERAL_HMAC_SECRET
  );
}

const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_BYTES = 32 * 1024 * 1024;

interface SignedProxyPayload {
  u: string;
  r?: string;
  o?: string;
  k?: 'hls' | 'vtt';
  exp: number;
}

function isPrivateOrBlockedHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }

  const ipType = net.isIP(host);
  if (ipType === 4) {
    const parts = host.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n))) return true;
    const [a, b] = parts;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return true;
    }
  } else if (ipType === 6) {
    if (
      host === '::1' ||
      host === '::' ||
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd')
    ) {
      return true;
    }
  }
  return false;
}

export function validateUpstreamMediaUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return null;
    if (isPrivateOrBlockedHost(parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function deriveUpstreamReferrer(
  embedUrl?: string | null,
  streamUrl?: string | null
): { referer?: string; origin?: string } {
  const candidates = [embedUrl, streamUrl];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'https:') continue;
      if (parsed.hostname === 'proxy2.neonflix.st') {
        const innerRef = parsed.searchParams.get('ref');
        if (innerRef) {
          const refParsed = new URL(innerRef);
          if (refParsed.protocol === 'https:') {
            return { referer: refParsed.toString(), origin: refParsed.origin };
          }
        }
        continue;
      }
      return {
        referer: `${parsed.origin}/`,
        origin: parsed.origin,
      };
    } catch {
      // ignore invalid URL
    }
  }
  return {};
}

export function unwrapKnownSubtitleProxy(rawUrl: string, fallbackReferer?: string): {
  targetUrl: string;
  referer?: string;
  origin?: string;
} {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname === 'proxy2.neonflix.st') {
      const innerUrl = parsed.searchParams.get('url');
      const innerRef = parsed.searchParams.get('ref') || fallbackReferer;
      if (innerUrl) {
        const validInner = validateUpstreamMediaUrl(innerUrl);
        if (validInner) {
          let origin: string | undefined;
          let referer: string | undefined;
          if (innerRef) {
            try {
              const refParsed = new URL(innerRef);
              if (refParsed.protocol === 'https:') {
                referer = refParsed.toString();
                origin = refParsed.origin;
              }
            } catch {
              // ignore
            }
          }
          return { targetUrl: validInner.toString(), referer, origin };
        }
      }
    }
  } catch {
    // ignore
  }
  return {
    targetUrl: rawUrl,
    referer: fallbackReferer,
    origin: fallbackReferer ? (() => { try { return new URL(fallbackReferer).origin; } catch { return undefined; } })() : undefined,
  };
}

function signPayload(payload: SignedProxyPayload): string {
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getProxySecret())
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

export function verifySignedProxyToken(token: string): SignedProxyPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  if (!data || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getProxySecret())
    .update(data)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SignedProxyPayload;
    if (!parsed || typeof parsed.u !== 'string' || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Date.now() > parsed.exp) {
      return null;
    }
    if (!validateUpstreamMediaUrl(parsed.u)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createSignedHlsProxyUrl(
  targetUrl: string,
  options?: {
    referer?: string;
    origin?: string;
    kind?: 'hls' | 'vtt';
  }
): string | null {
  const valid = validateUpstreamMediaUrl(targetUrl);
  if (!valid) return null;

  const payload: SignedProxyPayload = {
    u: valid.toString(),
    exp: Date.now() + TOKEN_TTL_MS,
    k: options?.kind || 'hls',
  };
  if (options?.referer && validateUpstreamMediaUrl(options.referer)) {
    payload.r = options.referer;
  }
  if (options?.origin && validateUpstreamMediaUrl(options.origin)) {
    payload.o = options.origin;
  }

  const token = signPayload(payload);
  return `/api/streaming/hls-proxy?token=${encodeURIComponent(token)}`;
}

export function rewriteM3u8Manifest(
  manifestText: string,
  baseManifestUrl: string,
  proxyContext?: { referer?: string; origin?: string }
): string {
  const signTarget = (rawUri: string): string => {
    const trimmed = rawUri.trim();
    if (!trimmed || trimmed.startsWith('data:')) return rawUri;
    try {
      const absolute = new URL(trimmed, baseManifestUrl).toString();
      const proxied = createSignedHlsProxyUrl(absolute, {
        referer: proxyContext?.referer,
        origin: proxyContext?.origin,
        kind: 'hls',
      });
      return proxied || rawUri;
    } catch {
      return rawUri;
    }
  };

  const lines = manifestText.split(/\r?\n/);
  const rewritten = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith('#')) {
      // Rewrite URI="..." inside #EXT-X-KEY, #EXT-X-MEDIA, #EXT-X-MAP, #EXT-X-I-FRAME-STREAM-INF, etc.
      return line.replace(/URI="([^"]+)"/g, (_match, uriVal: string) => {
        return `URI="${signTarget(uriVal)}"`;
      });
    }

    return signTarget(trimmed);
  });

  return rewritten.join('\n');
}

export async function proxyUpstreamMedia(
  token: string,
  rangeHeader?: string | null
): Promise<{
  ok: boolean;
  status: number;
  contentType: string;
  body?: string | Buffer;
  contentRange?: string | null;
  acceptRanges?: string | null;
  error?: string;
}> {
  const payload = verifySignedProxyToken(token);
  if (!payload) {
    return {
      ok: false,
      status: 403,
      contentType: 'application/json',
      error: 'Invalid or expired stream proxy token.',
    };
  }

  const headers: Record<string, string> = {
    'User-Agent': BROWSER_USER_AGENT,
    Accept:
      payload.k === 'vtt'
        ? 'text/vtt,text/plain,*/*'
        : 'application/vnd.apple.mpegurl,application/x-mpegurl,*/*',
  };
  if (payload.r) headers.Referer = payload.r;
  if (payload.o) headers.Origin = payload.o;
  if (rangeHeader && typeof rangeHeader === 'string' && /^bytes=\d*-\d*$/i.test(rangeHeader.trim())) {
    headers.Range = rangeHeader.trim();
  }

  const res = await reliableFetch(payload.u, {
    method: 'GET',
    redirect: 'follow',
    timeoutMs: 18_000,
    maxAttempts: 2,
    headers,
  });

  if (!(res.status >= 200 && res.status < 300)) {
    try {
      await res.body?.cancel();
    } catch {
      // ignore
    }
    return {
      ok: false,
      status: res.status === 404 ? 404 : 502,
      contentType: 'application/json',
      error: `Upstream media returned HTTP ${res.status}.`,
    };
  }

  const upstreamCt = (res.headers.get('content-type') || '').toLowerCase();
  if (upstreamCt.includes('text/html')) {
    try {
      await res.body?.cancel();
    } catch {
      // ignore
    }
    return {
      ok: false,
      status: 502,
      contentType: 'application/json',
      error: 'Upstream returned HTML instead of media content.',
    };
  }

  const parsedTarget = new URL(payload.u);
  const pathLower = parsedTarget.pathname.toLowerCase();
  const isM3u8 =
    pathLower.includes('.m3u8') ||
    upstreamCt.includes('mpegurl') ||
    upstreamCt.includes('x-mpegurl');

  if (isM3u8) {
    const text = await res.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_PLAYLIST_BYTES || !text.includes('#EXTM3U')) {
      return {
        ok: false,
        status: 502,
        contentType: 'application/json',
        error: 'Upstream returned an invalid HLS playlist.',
      };
    }
    const rewritten = rewriteM3u8Manifest(text, payload.u, {
      referer: payload.r,
      origin: payload.o,
    });
    return {
      ok: true,
      status: 200,
      contentType: 'application/vnd.apple.mpegurl; charset=utf-8',
      body: rewritten,
    };
  }

  const isVtt = payload.k === 'vtt' || pathLower.endsWith('.vtt') || upstreamCt.includes('text/vtt');
  if (isVtt) {
    const vttText = await res.text();
    if (Buffer.byteLength(vttText, 'utf8') > MAX_PLAYLIST_BYTES) {
      return {
        ok: false,
        status: 502,
        contentType: 'application/json',
        error: 'Subtitle file exceeds size limit.',
      };
    }
    return {
      ok: true,
      status: 200,
      contentType: 'text/vtt; charset=utf-8',
      body: vttText,
    };
  }

  const arrBuf = await res.arrayBuffer();
  if (arrBuf.byteLength > MAX_ASSET_BYTES) {
    return {
      ok: false,
      status: 502,
      contentType: 'application/json',
      error: 'Media segment exceeds size limit.',
    };
  }

  // Some providers disguise MPEG-TS segments with .jpg extension -> normalize to video/mp2t for browser MSE
  const contentType =
    upstreamCt && !upstreamCt.startsWith('image/')
      ? upstreamCt
      : 'video/mp2t';

  return {
    ok: true,
    status: res.status,
    contentType,
    body: Buffer.from(arrBuf),
    contentRange: res.headers.get('content-range'),
    acceptRanges: res.headers.get('accept-ranges'),
  };
}
