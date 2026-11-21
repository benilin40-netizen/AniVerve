import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../server.ts';
import { resolveEpisodeSources } from '../services/episodeDiscoveryService.ts';
import { dbGet, dbSet, ensureDefaultSeedData } from '../services/db.ts';
import type { StreamingProvider } from '../../src/types/anime.ts';
import {
  detectVideoElementAudioState,
  formatAudioTrackLabel,
  inspectHlsManifest,
  pickPreferredAudioTrackIndex,
  probeDirectMediaStream,
} from '../../src/utils/hlsAudio.ts';

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

describe('AniVerve Audio Playback, Redirect Sandbox & Navigation Lifecycle Verification', () => {
  let expressServer: http.Server;
  let apiBaseUrl = '';
  let originalYenime: StreamingProvider | null = null;
  let originalAniEmbed: StreamingProvider | null = null;

  before(async () => {
    await ensureDefaultSeedData();
    originalYenime = await dbGet<StreamingProvider>('anime_providers', 'yenime');
    originalAniEmbed = await dbGet<StreamingProvider>('anime_providers', 'aniembed');

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
    expressServer.closeAllConnections?.();
    await new Promise<void>((resolve) => expressServer.close(() => resolve()));
  });

  it('Audio Tests 1-4: Detects embedded audio, separate TYPE=AUDIO renditions, MP4 streams, and video-only streams accurately', async () => {
    // 1. Embedded muxed audio codec in HLS master
    const embeddedManifest = `#EXTM3U
#EXT-X-VERSION:4
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2"
1080p/index.m3u8`;
    const embeddedCheck = inspectHlsManifest(embeddedManifest, 'https://cdn.example.com/master.m3u8');
    assert.equal(embeddedCheck.validM3u8, true);
    assert.equal(embeddedCheck.hasAudio, 'yes');
    assert.equal(embeddedCheck.hasSeparateAudioPlaylist, false);

    // 2. Separate TYPE=AUDIO rendition HLS playlist (where hls.light.min.js previously failed silently)
    const separateAudioManifest = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="Japanese",LANGUAGE="ja",DEFAULT=YES,AUTOSELECT=YES,URI="audio/jpn/index.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="English",LANGUAGE="en",DEFAULT=NO,AUTOSELECT=YES,URI="audio/eng/index.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=3200000,RESOLUTION=1920x1080,CODECS="avc1.64002a,mp4a.40.2",AUDIO="aac"
video/1080p.m3u8`;
    const separateCheck = inspectHlsManifest(separateAudioManifest, 'https://cdn.example.com/ep1/master.m3u8');
    assert.equal(separateCheck.validM3u8, true);
    assert.equal(separateCheck.hasAudio, 'yes');
    assert.equal(separateCheck.hasSeparateAudioPlaylist, true);
    assert.equal(separateCheck.audioRenditions.length, 2);
    assert.equal(separateCheck.audioRenditions[0].uri, 'https://cdn.example.com/ep1/audio/jpn/index.m3u8');
    assert.equal(separateCheck.audioRenditions[1].language, 'en');

    // 4. Video-only HLS master playlist
    const videoOnlyManifest = `#EXTM3U
#EXT-X-VERSION:4
#EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=1280x720,CODECS="avc1.64001f"
video-only.m3u8`;
    const videoOnlyCheck = inspectHlsManifest(videoOnlyManifest, 'https://cdn.example.com/silent/master.m3u8');
    assert.equal(videoOnlyCheck.validM3u8, true);
    assert.equal(videoOnlyCheck.hasAudio, 'no');

    // Live HTTP probe for Test 3 (MP4) + separate audio M3U8 + Cloudflare 403 HTML shell
    const mockMedia = await startMockServer((req, res) => {
      if (req.url === '/valid-separate.m3u8') {
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        res.end(separateAudioManifest);
        return;
      }
      if (req.url === '/video-only.m3u8') {
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        res.end(videoOnlyManifest);
        return;
      }
      if (req.url === '/episode.mp4') {
        res.writeHead(206, { 'Content-Type': 'video/mp4' });
        res.end(Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]));
        return;
      }
      res.writeHead(403, { 'Content-Type': 'text/html' });
      res.end('<html>Cloudflare 403</html>');
    });

    try {
      const hlsProbe = await probeDirectMediaStream(`${mockMedia.baseUrl}/valid-separate.m3u8`);
      assert.equal(hlsProbe.accessible, true);
      assert.equal(hlsProbe.kind, 'hls');
      assert.equal(hlsProbe.hasAudio, 'yes');

      const mp4Probe = await probeDirectMediaStream(`${mockMedia.baseUrl}/episode.mp4`);
      assert.equal(mp4Probe.accessible, true);
      assert.equal(mp4Probe.kind, 'mp4');

      const silentProbe = await probeDirectMediaStream(`${mockMedia.baseUrl}/video-only.m3u8`);
      assert.equal(silentProbe.accessible, true);
      assert.equal(silentProbe.hasAudio, 'no');

      const blockedProbe = await probeDirectMediaStream(`${mockMedia.baseUrl}/protected.m3u8`);
      assert.equal(blockedProbe.accessible, false);
    } finally {
      mockMedia.server.closeAllConnections?.();
      await new Promise<void>((r) => mockMedia.server.close(() => r()));
    }
  });

  it('Audio Tests 5-7: Selects Japanese/English audio tracks, verifies video element decoded audio diagnostics, and prefers DUB-capable providers', async () => {
    const tracks = [
      { id: 0, name: 'Japanese', lang: 'ja', default: true },
      { id: 1, name: 'English Dub', lang: 'en', default: false },
    ];
    assert.equal(pickPreferredAudioTrackIndex(tracks, 'sub'), 0);
    assert.equal(pickPreferredAudioTrackIndex(tracks, 'dub'), 1);
    assert.equal(formatAudioTrackLabel(tracks[0], 0), 'Japanese');
    assert.equal(formatAudioTrackLabel({ id: 2, name: 'Main Audio', lang: 'en' }, 2), 'Main Audio (EN)');

    // Simulated HTMLVideoElement checks (with and without decoded audio bytes)
    const silentVideo = {
      muted: false,
      volume: 1,
      readyState: 4,
      currentTime: 3.5,
      webkitAudioDecodedByteCount: 0,
    } as unknown as HTMLVideoElement;
    const silentDiag = detectVideoElementAudioState(silentVideo);
    assert.equal(silentDiag.hasPlayableAudio, false);
    assert.equal(silentDiag.muted, false);

    const healthyVideo = {
      muted: false,
      volume: 0.8,
      readyState: 4,
      currentTime: 3.5,
      webkitAudioDecodedByteCount: 48200,
    } as unknown as HTMLVideoElement;
    const healthyDiag = detectVideoElementAudioState(healthyVideo);
    assert.equal(healthyDiag.hasPlayableAudio, true);
    assert.equal(healthyDiag.volume, 0.8);

    // Live DUB preference test: AniEmbed supports ?lang=dub natively while player.yenime.net is sub-only embed
    const dubRes = await resolveEpisodeSources(154587, 1, { lang: 'dub' });
    assert.equal(dubRes.allFailed, false);
    if (!dubRes.sources[0].directPlayable && dubRes.sources.length > 1) {
      assert.equal(dubRes.preferredSource?.providerKey, 'aniembed');
      assert.ok(dubRes.preferredSource?.embedUrl?.includes('lang=dub'));
    }
  });

  it('Audio Test 8: Falls back to backup provider when primary direct stream is video-only (0 audio)', async () => {
    const videoOnlyStream = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720,CODECS="avc1.4d401f"
video.m3u8`;

    const mockUpstream = await startMockServer((req, res) => {
      if (req.url?.startsWith('/megaplay')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            m3u8: `${mockUpstream.baseUrl}/video-only.m3u8`,
            embedUrl: 'https://player.yenime.net/anime/ani/154587/1',
          })
        );
        return;
      }
      if (req.url === '/video-only.m3u8') {
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
        res.end(videoOnlyStream);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><html><body>AniEmbed Player</body></html>');
    });

    const realFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (urlStr.startsWith('https://api.yenime.net/megaplay')) {
          return realFetch(`${mockUpstream.baseUrl}/megaplay`, init);
        }
        return realFetch(input as any, init);
      }) as typeof fetch;

      const resolved = await resolveEpisodeSources(154587, 1, { lang: 'sub' });
      const yenimeSrc = resolved.sources.find((s) => s.providerKey === 'yenime');
      assert.ok(yenimeSrc);
      // Must detect video-only stream accurately and refuse to mark it as directPlayable audio
      assert.equal(yenimeSrc.directPlayable, false);
      assert.equal(yenimeSrc.directStreamHasAudio, 'no');
      assert.ok(resolved.diagnostics);
      assert.equal(resolved.diagnostics.anilistId, 154587);
      assert.ok(Array.isArray(resolved.diagnostics.attemptedProviders));
    } finally {
      globalThis.fetch = realFetch;
      mockUpstream.server.closeAllConnections?.();
      await new Promise<void>((r) => mockUpstream.server.close(() => r()));
    }
  });

  it('Navigation Tests 1-9: Verifies CSP media-src, strict iframe sandbox, lifecycle cleanup, removed media proxy, and clean SPA routing', async () => {
    const res = await fetch(`${apiBaseUrl}/api/health`);
    assert.equal(res.status, 200);
    const csp = res.headers.get('content-security-policy') || '';
    assert.ok(csp.includes("media-src 'self' https: blob:"), `Expected media-src in CSP, got: ${csp}`);
    assert.ok(csp.includes("object-src 'none'"));
    assert.ok(csp.includes('https://player.yenime.net'));
    assert.ok(csp.includes('https://aniembed.se'));

    // Non-compliant /hls-proxy route must no longer exist
    const proxyRes = await fetch(`${apiBaseUrl}/api/streaming/hls-proxy`);
    assert.equal(proxyRes.status, 404);

    // Verify Player.tsx enforces sandbox blocking top-level navigation/popups, full hls.js, unmuted Play-with-sound UX, and complete teardown
    const playerSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/player/Player.tsx'),
      'utf8'
    );
    assert.ok(playerSource.includes("import Hls from 'hls.js'"), 'Must use full hls.js build, not hls.light');
    assert.ok(
      playerSource.includes('sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"'),
      'Iframe must enforce sandbox without allow-top-navigation or unsolicited popups'
    );
    assert.ok(!playerSource.includes('allow-top-navigation'), 'Must never grant allow-top-navigation');
    assert.ok(playerSource.includes('rel="noopener noreferrer"'), 'External Open Provider link must use noopener noreferrer');
    assert.ok(playerSource.includes('Play with sound'), 'Must provide explicit Play with sound control on autoplay block');
    assert.ok(playerSource.includes('hls.destroy()'), 'Must destroy hls.js on unmount/source change');
    assert.ok(
      playerSource.includes(".src = 'about:blank'"),
      'Must clear iframe src on unmount/navigation'
    );
    assert.ok(playerSource.includes('pointer-events-none'), 'Loading overlay must not intercept pointer events outside stage');
    assert.ok(playerSource.includes('relative isolate aspect-video'), 'Player stage must isolate z-index stacking');

    // Verify WatchPage & AppShell routes remain cleanly wired without overlay lock
    const watchSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/pages/Watch/WatchPage.tsx'),
      'utf8'
    );
    assert.ok(watchSource.includes('document.exitFullscreen'), 'Must exit fullscreen cleanly when navigating away');
    assert.ok(watchSource.includes('source={activeSource}'), 'WatchPage must pass activeSource to Player');
  });
});
