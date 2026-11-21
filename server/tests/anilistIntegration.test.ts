import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../server.ts';
import { clearCacheByPrefix } from '../services/cacheService.ts';
import { dbGet, dbSet, ensureDefaultSeedData } from '../services/db.ts';
import type { StreamingProvider } from '../../src/types/anime.ts';

describe('AniVerve AniList API Integration & Catalog Truthfulness Verification', () => {
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
    clearCacheByPrefix('');
    expressServer.closeAllConnections?.();
    await new Promise<void>((resolve) => expressServer.close(() => resolve()));
  });

  it('1. Searches anime by title via /api/anime/search and /api/anime/explore', async () => {
    const searchRes = await fetch(`${apiBaseUrl}/api/anime/search?q=Frieren`);
    assert.equal(searchRes.status, 200);
    const searchJson = (await searchRes.json()) as any;
    assert.ok(Array.isArray(searchJson.results));
    assert.ok(searchJson.results.length > 0, 'Expected quick search results for Frieren');
    assert.ok(
      searchJson.results.some((a: any) => a.id === 154587),
      'Expected Frieren (AniList #154587) in search results'
    );

    const exploreRes = await fetch(
      `${apiBaseUrl}/api/anime/explore?search=Frieren&perPage=6&page=1`
    );
    assert.equal(exploreRes.status, 200);
    const exploreJson = (await exploreRes.json()) as any;
    assert.ok(Array.isArray(exploreJson.media));
    assert.ok(exploreJson.media.length > 0);
  });

  it('2. Loads full anime details with cover, banner, genres, non-spoiler tags, studios, characters, staff & separate IDs', async () => {
    const detailRes = await fetch(`${apiBaseUrl}/api/anime/154587`);
    assert.equal(detailRes.status, 200);
    const detailJson = (await detailRes.json()) as any;
    const anime = detailJson.anime;

    assert.equal(anime.id, 154587);
    assert.equal(anime.idMal, 52991);
    assert.ok(anime.coverImage?.extraLarge || anime.coverImage?.large);
    assert.ok(anime.bannerImage);
    assert.ok(typeof anime.description === 'string' && anime.description.length > 50);
    assert.ok(Array.isArray(anime.genres) && anime.genres.includes('Adventure'));
    assert.ok(Array.isArray(anime.tags) && anime.tags.length > 0, 'Expected AniList tags');
    assert.ok(
      anime.tags.every((t: any) => !t.isAdult && !t.isMediaSpoiler && !t.isGeneralSpoiler),
      'Spoiler and adult tags must be excluded'
    );
    assert.ok(anime.season === 'FALL' && anime.seasonYear === 2023);
    assert.ok(typeof anime.status === 'string');
    assert.equal(anime.episodes, 28);
    assert.equal(anime.format, 'TV');
    assert.ok(typeof anime.duration === 'number' && anime.duration > 0);
    assert.ok(Array.isArray(anime.studios?.nodes) && anime.studios.nodes.length > 0);
    assert.ok(Array.isArray(anime.characters?.edges) && anime.characters.edges.length > 0);
    assert.ok(Array.isArray(anime.staff?.edges) && anime.staff.edges.length > 0);
  });

  it('3 & 4. Loads popular, trending, seasonal, upcoming anime collections and supports tag filtering', async () => {
    const homeRes = await fetch(`${apiBaseUrl}/api/anime/home`);
    assert.equal(homeRes.status, 200);
    const homeJson = (await homeRes.json()) as any;

    assert.ok(Array.isArray(homeJson.trending) && homeJson.trending.length > 0);
    assert.ok(Array.isArray(homeJson.popular) && homeJson.popular.length > 0);
    assert.ok(Array.isArray(homeJson.seasonal) && homeJson.seasonal.length > 0);
    assert.ok(Array.isArray(homeJson.upcoming) && homeJson.upcoming.length > 0);

    const seasonalRes = await fetch(
      `${apiBaseUrl}/api/anime/explore?season=FALL&year=2023&sort=POPULARITY_DESC&perPage=6`
    );
    assert.equal(seasonalRes.status, 200);
    const seasonalJson = (await seasonalRes.json()) as any;
    assert.ok(Array.isArray(seasonalJson.media) && seasonalJson.media.length > 0);

    const tagRes = await fetch(
      `${apiBaseUrl}/api/anime/explore?tag=${encodeURIComponent('Magic')}&sort=POPULARITY_DESC&perPage=6`
    );
    assert.equal(tagRes.status, 200);
    const tagJson = (await tagRes.json()) as any;
    assert.ok(Array.isArray(tagJson.media) && tagJson.media.length > 0);
  });

  it('5. Resolves AniList ID <-> MAL ID bidirectionally without confusing the two', async () => {
    const byAniRes = await fetch(`${apiBaseUrl}/api/anime/resolve-ids?anilistId=154587`);
    assert.equal(byAniRes.status, 200);
    const byAniJson = (await byAniRes.json()) as any;
    assert.equal(byAniJson.mapping.anilistId, 154587);
    assert.equal(byAniJson.mapping.malId, 52991);

    const byMalRes = await fetch(`${apiBaseUrl}/api/anime/resolve-ids?malId=52991`);
    assert.equal(byMalRes.status, 200);
    const byMalJson = (await byMalRes.json()) as any;
    assert.equal(byMalJson.mapping.anilistId, 154587);
    assert.equal(byMalJson.mapping.malId, 52991);

    const badRes = await fetch(`${apiBaseUrl}/api/anime/resolve-ids?anilistId=-5`);
    assert.equal(badRes.status, 400);
  });

  it('6. Supports accurate pagination across AniList pages', async () => {
    const [p1Res, p2Res] = await Promise.all([
      fetch(`${apiBaseUrl}/api/anime/explore?sort=POPULARITY_DESC&page=1&perPage=6`),
      fetch(`${apiBaseUrl}/api/anime/explore?sort=POPULARITY_DESC&page=2&perPage=6`),
    ]);
    assert.equal(p1Res.status, 200);
    assert.equal(p2Res.status, 200);

    const p1 = (await p1Res.json()) as any;
    const p2 = (await p2Res.json()) as any;

    assert.equal(p1.pageInfo.currentPage, 1);
    assert.equal(p2.pageInfo.currentPage, 2);
    assert.equal(p1.pageInfo.hasNextPage, true);
    assert.equal(p1.media.length, 6);
    assert.equal(p2.media.length, 6);

    const p1Ids = new Set(p1.media.map((m: any) => m.id));
    const overlap = p2.media.filter((m: any) => p1Ids.has(m.id));
    assert.equal(overlap.length, 0, 'Page 1 and Page 2 should return distinct anime items');
  });

  it('7. Preserves AniList catalog when all streaming providers fail AND never fabricates playable episodes from AniList count', async () => {
    assert.ok(originalYenime && originalAniEmbed);

    // Simulate total streaming provider outage (all providers disabled)
    await dbSet('anime_providers', 'yenime', { ...originalYenime, isEnabled: false });
    await dbSet('anime_providers', 'aniembed', { ...originalAniEmbed, isEnabled: false });
    clearCacheByPrefix('anime:episodes:');

    // AniList catalog endpoints must still succeed completely
    const [homeRes, detailRes, epRes] = await Promise.all([
      fetch(`${apiBaseUrl}/api/anime/home`),
      fetch(`${apiBaseUrl}/api/anime/154587`),
      fetch(`${apiBaseUrl}/api/anime/154587/episodes?refresh=1`),
    ]);

    assert.equal(homeRes.status, 200);
    assert.equal(detailRes.status, 200);
    assert.equal(epRes.status, 200);

    const epJson = (await epRes.json()) as any;
    assert.equal(epJson.anilistId, 154587);
    assert.equal(epJson.malId, 52991);
    assert.equal(epJson.catalogEpisodes, 28, 'Catalog episode reference count should be preserved');
    assert.equal(
      epJson.episodes.length,
      0,
      'Must NOT fabricate playable streaming episodes from AniList catalog count when all providers fail'
    );
    assert.equal(epJson.discoveryStatus, 'unavailable');
  });
});
