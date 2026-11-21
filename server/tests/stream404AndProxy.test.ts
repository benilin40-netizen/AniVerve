import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../server.ts';
import { inspectAniEmbedHtml } from '../services/providerInspection.ts';
import {
  createSignedHlsProxyUrl,
  rewriteM3u8Manifest,
  unwrapKnownSubtitleProxy,
  validateUpstreamMediaUrl,
  verifySignedProxyToken,
} from '../services/hlsProxyService.ts';
import {
  discoverAnimeEpisodes,
  resolveEpisodeSources,
} from '../services/episodeDiscoveryService.ts';
import { clearCacheByPrefix } from '../services/cacheService.ts';
import { dbGet, dbSet, ensureDefaultSeedData } from '../services/db.ts';
import type { StreamingProvider } from '../../src/types/anime.ts';

function startMockServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

describe('AniVerve 404 Soft-Error Detection, Fallback Search & Signed HLS Proxy Verification', () => {
  let expressServer: http.Server;
  let apiBaseUrl = '';
  let originalYenime: StreamingProvider | null = null;
  let originalAniEmbed: StreamingProvider | null = null;

  before(async () => {
    await ensureDefaultSeedData();
    originalYenime = await dbGet<StreamingProvider>('anime_providers', 'yenime');
    originalAniEmbed = await dbGet<StreamingProvider>('anime_providers', 'aniembed');

    if (originalYenime) {
      await dbSet('anime_providers', 'yenime', {
        ...originalYenime,
        isEnabled: true,
        licenseVerified: true,
        documentedPermission: true,
        embeddingAllowed: true,
        verificationNotes: 'Authorized automated proxy test configuration',
      });
    }
    if (originalAniEmbed) {
      await dbSet('anime_providers', 'aniembed', {
        ...originalAniEmbed,
        isEnabled: true,
        licenseVerified: true,
        documentedPermission: true,
        embeddingAllowed: true,
        verificationNotes: 'Authorized automated proxy test configuration',
      });
    }

    const app = createApp();
    await new Promise<void>((resolve) => {
      expressServer = app.listen(0, '127.0.0.1', () => {
        const addr = expressServer.address() as AddressInfo;
        apiBaseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (originalYenime) await dbSet('anime_providers', 'yenime', originalYenime);
    if (originalAniEmbed) await dbSet('anime_providers', 'aniembed', originalAniEmbed);
    clearCacheByPrefix('');
    expressServer.closeAllConnections?.();
    await new Promise<void>((resolve) => expressServer.close(() => resolve()));
  });

  it('inspectAniEmbedHtml rejects HTTP 200 soft-404 shells, missing servers, and empty audio provider lists', () => {
    const soft404Html = `<!doctype html><html><body><div>Couldn't load the player</div><script>
      data:{servers:null,error:"API responded with 404"}
    </script></body></html>`;
    const resSoft404 = inspectAniEmbedHtml(soft404Html, 200, 'sub');
    assert.equal(resSoft404.ok, false);
    assert.equal(resSoft404.extractedStatus, 404);
    assert.match(resSoft404.reason || '', /404/i);

    const subOnlyHtml = `<!doctype html><html><body><script>
      data:{servers:{subProviders:[{name:"VidWish",id:"1"}],dubProviders:[]},error:null}
    </script></body></html>`;
    const resSub = inspectAniEmbedHtml(subOnlyHtml, 200, 'sub');
    assert.equal(resSub.ok, true);
    const resDub = inspectAniEmbedHtml(subOnlyHtml, 200, 'dub');
    assert.equal(resDub.ok, false);
    assert.equal(resDub.extractedStatus, 404);

    const validHtml = `<!doctype html><html><body><script>
      data:{servers:{subProviders:[{name:"VidWish"}],dubProviders:[{name:"MegaPlay"}]},error:null}
    </script></body></html>`;
    assert.equal(inspectAniEmbedHtml(validHtml, 200, 'dub').ok, true);
  });

  it('hlsProxyService enforces HTTPS/SSRF rules, HMAC signatures, subtitle unwrapping, and M3U8 URI rewriting', () => {
    assert.equal(validateUpstreamMediaUrl('http://cdn.example.com/a.m3u8'), null);
    assert.equal(validateUpstreamMediaUrl('https://127.0.0.1/a.m3u8'), null);
    assert.equal(validateUpstreamMediaUrl('https://169.254.169.254/latest'), null);
    assert.equal(validateUpstreamMediaUrl('https://10.0.0.5/a.m3u8'), null);
    assert.equal(validateUpstreamMediaUrl('https://localhost/a.m3u8'), null);
    assert.ok(validateUpstreamMediaUrl('https://fetch.nexabloom.top/anime/master.m3u8'));

    const signedPath = createSignedHlsProxyUrl('https://fetch.nexabloom.top/anime/master.m3u8', {
      referer: 'https://megaplay.buzz/',
      origin: 'https://megaplay.buzz',
      kind: 'hls',
    });
    assert.ok(signedPath?.startsWith('/api/streaming/hls-proxy?token='));
    const token = new URL(`http://localhost${signedPath}`).searchParams.get('token')!;
    const verified = verifySignedProxyToken(token);
    assert.ok(verified);
    assert.equal(verified.u, 'https://fetch.nexabloom.top/anime/master.m3u8');
    assert.equal(verified.r, 'https://megaplay.buzz/');
    assert.equal(verifySignedProxyToken(`${token}tamper`), null);

    const sampleM3u8 = `#EXTM3U
#EXT-X-VERSION:4
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="Japanese",LANGUAGE="ja",DEFAULT=YES,URI="audio/ja.m3u8"
#EXT-X-KEY:METHOD=AES-128,URI="keys/enc.key"
#EXT-X-STREAM-INF:BANDWIDTH=2000000,CODECS="avc1.640032,mp4a.40.2"
1080p/index.m3u8`;

    const rewritten = rewriteM3u8Manifest(
      sampleM3u8,
      'https://fetch.nexabloom.top/anime/master.m3u8',
      { referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz' }
    );
    const lines = rewritten.split('\n');
    assert.ok(lines[2].includes('URI="/api/streaming/hls-proxy?token='));
    assert.ok(lines[3].includes('URI="/api/streaming/hls-proxy?token='));
    assert.ok(lines[5].startsWith('/api/streaming/hls-proxy?token='));

    const unwrapped = unwrapKnownSubtitleProxy(
      'https://proxy2.neonflix.st/proxy?url=https%3A%2F%2Fsubs.example.com%2Fen.vtt&ref=https%3A%2F%2Fmegaplay.buzz%2F'
    );
    assert.equal(unwrapped.targetUrl, 'https://subs.example.com/en.vtt');
    assert.equal(unwrapped.referer, 'https://megaplay.buzz/');
  });

  it('Express /api/streaming/hls-proxy rejects unsigned or tampered tokens safely', async () => {
    const noToken = await fetch(`${apiBaseUrl}/api/streaming/hls-proxy`);
    assert.equal(noToken.status, 400);

    const badToken = await fetch(`${apiBaseUrl}/api/streaming/hls-proxy?token=invalid.sig`);
    assert.equal(badToken.status, 403);
  });

  it('Recovers stream via Yenime /search -> /episodes -> /sources fallback and blocks soft-404 AniEmbed', async () => {
    const mockUpstream = await startMockServer((req, res) => {
      const reqUrl = req.url || '';
      if (reqUrl.startsWith('/anime')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not mapped by MAL' }));
        return;
      }
      if (reqUrl.startsWith('/megaplay')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Could not extract m3u8' }));
        return;
      }
      if (reqUrl.startsWith('/search')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            results: [{ id: 'frieren-123', title: 'Frieren: Beyond Journey\'s End', malId: 52991 }],
          })
        );
        return;
      }
      if (reqUrl.startsWith('/episodes')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify([
            { id: 1, number: 1, title: 'The Journey\'s End', hasSub: true, hasDub: true, servers: 'tok-ep1' },
            { id: 2, number: 2, title: 'Unindexed Gap', hasSub: true, hasDub: false, servers: null },
          ])
        );
        return;
      }
      if (reqUrl.startsWith('/sources')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            episode: 1,
            types: [
              {
                type: 'sub',
                servers: [
                  {
                    name: 'HD-1',
                    embedUrl: 'https://megaplay.buzz/stream/s-2/1234/sub',
                    m3u8: 'https://cdn.example.com/hls/ep1.m3u8',
                    tracks: [
                      {
                        file: 'https://proxy2.neonflix.st/proxy?url=https%3A%2F%2Fsubs.example.com%2Fen.vtt&ref=https%3A%2F%2Fmegaplay.buzz%2F',
                        label: 'English',
                        kind: 'captions',
                      },
                    ],
                    skipData: { intro: [10, 95] },
                  },
                ],
              },
            ],
          })
        );
        return;
      }
      if (reqUrl.startsWith('/cdn-m3u8')) {
        const ref = req.headers.referer || '';
        if (!ref.includes('megaplay.buzz')) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Referer required');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        res.end('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2500000,CODECS="avc1.640028,mp4a.40.2"\n720.m3u8');
        return;
      }
      // AniEmbed soft-404 page (HTTP 200 but API responded with 404)
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><html><body>Couldn\'t load the player error:"API responded with 404"</body></html>');
    });

    const realFetch = globalThis.fetch;
    try {
      clearCacheByPrefix('anime:episodes:');
      const currentY = await dbGet<StreamingProvider>('anime_providers', 'yenime');
      await dbSet('anime_providers', 'yenime', {
        ...currentY!,
        baseUrl: 'https://api.yenime.net',
        isEnabled: true,
        licenseVerified: true,
        healthState: 'READY',
        cooldownUntil: null,
      });

      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (urlStr.startsWith('https://api.yenime.net')) {
          const parsed = new URL(urlStr);
          return realFetch(`${mockUpstream.baseUrl}${parsed.pathname}${parsed.search}`, init);
        }
        if (urlStr.startsWith('https://cdn.example.com/hls/ep1.m3u8')) {
          return realFetch(`${mockUpstream.baseUrl}/cdn-m3u8`, init);
        }
        if (urlStr.startsWith('https://aniembed.se/')) {
          return realFetch(`${mockUpstream.baseUrl}/aniembed-soft404`, init);
        }
        return realFetch(input as any, init);
      }) as typeof fetch;

      // 1. Episode discovery recovers from Yenime /search -> /episodes even while AniEmbed soft-404s
      const discovery = await discoverAnimeEpisodes(154587, { refresh: true });
      assert.ok(discovery.episodes.length >= 2);
      assert.equal(discovery.episodes[0].playable, true);
      assert.ok(discovery.providers.some((p) => p.providerKey === 'aniembed' && p.status === 'error'));

      // 2. resolveEpisodeSources falls back from /megaplay 404 -> /sources, issues proxiedHlsUrl + proxied VTT,
      //    and rejects soft-404 AniEmbed while auto-selecting Yenime HLS!
      const resolved = await resolveEpisodeSources(154587, 1, { lang: 'sub', refresh: true });
      assert.equal(resolved.allFailed, false);
      assert.equal(resolved.preferredSource?.providerKey, 'yenime');
      assert.equal(resolved.preferredSource?.directPlayable, true);
      assert.equal(resolved.preferredSource?.format, 'hls');
      assert.ok(resolved.preferredSource?.proxiedHlsUrl?.startsWith('/api/streaming/hls-proxy?token='));
      assert.ok(resolved.preferredSource?.subtitles?.[0]?.file.startsWith('/api/streaming/hls-proxy?token='));
      assert.deepEqual(resolved.preferredSource?.skipData?.intro, { start: 10, end: 95 });
      assert.ok(resolved.errors.some((e) => e.providerKey === 'aniembed' && e.status === 404));
    } finally {
      globalThis.fetch = realFetch;
      if (originalYenime) await dbSet('anime_providers', 'yenime', originalYenime);
      clearCacheByPrefix('anime:episodes:');
      mockUpstream.server.closeAllConnections?.();
      await new Promise<void>((r) => mockUpstream.server.close(() => r()));
    }
  });
});
