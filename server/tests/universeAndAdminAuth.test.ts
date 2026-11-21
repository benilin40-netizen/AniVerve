import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { createApp } from '../../server.ts';
import { dbDelete, dbGet, dbList, dbSet, ensureDefaultSeedData } from '../services/db.ts';
import type { AdminCredentialRecord } from '../services/adminAuthService.ts';
import type { HomepageUniverseConfig } from '../../src/types/anime.ts';

function parseSetCookies(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  const setCookies = headers.getSetCookie?.() || [];
  for (const raw of setCookies) {
    const first = raw.split(';')[0];
    const eq = first.indexOf('=');
    if (eq > 0) {
      out[first.slice(0, eq).trim()] = first.slice(eq + 1).trim();
    }
  }
  return out;
}

describe('AniVerve 2.0 Independent Admin Auth, Visual Editor, Discovery & Engagement Verification', () => {
  let expressServer: http.Server;
  let apiBaseUrl = '';
  let originalCred: AdminCredentialRecord | null = null;
  let originalConfig: HomepageUniverseConfig | null = null;
  let testUserId = '';
  let testUserToken = '';

  const TEST_INITIAL_ADMIN_PWD = 'AniVerveTest2026!A';
  const TEST_ROTATED_ADMIN_PWD = 'AniVerveRotated2026!Z';

  before(async () => {
    await ensureDefaultSeedData();
    originalCred = await dbGet<AdminCredentialRecord>('admin_credentials', 'primary');
    originalConfig = await dbGet<HomepageUniverseConfig>('universe_configs', 'homepage');

    // Seed a known admin credential hash for deterministic test verification
    const hash = await bcrypt.hash(TEST_INITIAL_ADMIN_PWD, 10);
    await dbSet<AdminCredentialRecord>('admin_credentials', 'primary', {
      id: 'primary',
      passwordHash: hash,
      mustChangePassword: false,
      usingEnvPassword: false,
      envPasswordFingerprint: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const app = createApp();
    await new Promise<void>((resolve) => {
      expressServer = app.listen(0, '127.0.0.1', () => {
        const addr = expressServer.address() as AddressInfo;
        apiBaseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Register an ephemeral member account for user-scoped Universe endpoints
    const email = `universe-test-${Date.now()}@example.com`;
    const regRes = await fetch(`${apiBaseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `tester${Date.now().toString().slice(-5)}`,
        email,
        password: 'MemberPass2026',
      }),
    });
    assert.equal(regRes.status, 201);
    const regJson = (await regRes.json()) as any;
    testUserId = regJson.user.id;
    testUserToken = regJson.token;
  });

  after(async () => {
    if (originalCred) {
      await dbSet('admin_credentials', 'primary', originalCred);
    } else {
      await dbDelete('admin_credentials', 'primary');
    }
    if (originalConfig) {
      await dbSet('universe_configs', 'homepage', originalConfig);
    }
    if (testUserId) {
      for (const col of ['sessions', 'user_collections', 'premiere_reminders', 'anime_faceoff_votes']) {
        const items = await dbList<{ id: string; userId?: string }>(col, (i) => i.userId === testUserId);
        for (const item of items) await dbDelete(col, item.id);
      }
      await dbDelete('user_preferences', testUserId);
      await dbDelete('users', testUserId);
    }
    expressServer.closeAllConnections?.();
    await new Promise<void>((resolve) => expressServer.close(() => resolve()));
  });

  it('1. Legacy Firebase/bootstrap admin auth routes are retired (410 Gone)', async () => {
    for (const path of ['/api/auth/admin-login', '/api/auth/firebase', '/api/auth/bootstrap-admin']) {
      const res = await fetch(`${apiBaseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 410, `Expected ${path} to return 410 Gone`);
    }
  });

  it('2. Admin endpoints reject unauthenticated access and enforce CSRF token on mutations', async () => {
    const unauthOv = await fetch(`${apiBaseUrl}/api/admin/overview`);
    assert.equal(unauthOv.status, 401);

    const badLogin = await fetch(`${apiBaseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'WrongPassword123' }),
    });
    assert.equal(badLogin.status, 401);

    const goodLogin = await fetch(`${apiBaseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: TEST_INITIAL_ADMIN_PWD }),
    });
    assert.equal(goodLogin.status, 200);
    const loginJson = (await goodLogin.json()) as any;
    assert.equal(loginJson.authenticated, true);
    assert.equal(loginJson.authMode, 'backend-password');
    assert.ok(loginJson.csrfToken);

    const cookies = parseSetCookies(goodLogin.headers);
    assert.ok(cookies.aniverve_admin_session);
    assert.ok(cookies.aniverve_admin_csrf);
    const cookieHeader = `aniverve_admin_session=${cookies.aniverve_admin_session}; aniverve_admin_csrf=${cookies.aniverve_admin_csrf}`;

    // Verify GET session & GET overview succeed without Firebase token
    const sessRes = await fetch(`${apiBaseUrl}/api/admin/session`, {
      headers: { Cookie: cookieHeader },
    });
    assert.equal(sessRes.status, 200);
    const sessJson = (await sessRes.json()) as any;
    assert.equal(sessJson.authenticated, true);

    const ovRes = await fetch(`${apiBaseUrl}/api/admin/overview`, {
      headers: { Cookie: cookieHeader },
    });
    assert.equal(ovRes.status, 200);

    // Mutating admin route WITHOUT X-CSRF-Token must fail 403
    const noCsrfPatch = await fetch(`${apiBaseUrl}/api/admin/universe-config`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ particleDensity: 'cinematic' }),
    });
    assert.equal(noCsrfPatch.status, 403);

    // Incremental PATCH WITH X-CSRF-Token merges cleanly without wiping announcementBanner
    const validPatch = await fetch(`${apiBaseUrl}/api/admin/universe-config`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
        'X-CSRF-Token': cookies.aniverve_admin_csrf,
      },
      body: JSON.stringify({ particleDensity: 'cinematic' }),
    });
    assert.equal(validPatch.status, 200);
    const patchedJson = (await validPatch.json()) as any;
    assert.equal(patchedJson.config.particleDensity, 'cinematic');
    assert.ok(patchedJson.config.announcementBanner);

    // Change password invalidates old session and rotates cookies cleanly
    const weakChange = await fetch(`${apiBaseUrl}/api/admin/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
        'X-CSRF-Token': cookies.aniverve_admin_csrf,
      },
      body: JSON.stringify({
        currentPassword: TEST_INITIAL_ADMIN_PWD,
        newPassword: 'weak',
      }),
    });
    assert.equal(weakChange.status, 400);

    const changeRes = await fetch(`${apiBaseUrl}/api/admin/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
        'X-CSRF-Token': cookies.aniverve_admin_csrf,
      },
      body: JSON.stringify({
        currentPassword: TEST_INITIAL_ADMIN_PWD,
        newPassword: TEST_ROTATED_ADMIN_PWD,
      }),
    });
    assert.equal(changeRes.status, 200);
    const newCookies = parseSetCookies(changeRes.headers);
    assert.ok(newCookies.aniverve_admin_session);

    // Old session cookie is now revoked
    const oldOv = await fetch(`${apiBaseUrl}/api/admin/overview`, {
      headers: { Cookie: cookieHeader },
    });
    assert.equal(oldOv.status, 401);

    // New session cookie works & logout revokes it cleanly
    const newCookieHeader = `aniverve_admin_session=${newCookies.aniverve_admin_session}; aniverve_admin_csrf=${newCookies.aniverve_admin_csrf}`;
    const newOv = await fetch(`${apiBaseUrl}/api/admin/overview`, {
      headers: { Cookie: newCookieHeader },
    });
    assert.equal(newOv.status, 200);

    const logoutRes = await fetch(`${apiBaseUrl}/api/admin/logout`, {
      method: 'POST',
      headers: { Cookie: newCookieHeader },
    });
    assert.equal(logoutRes.status, 200);

    const postLogoutOv = await fetch(`${apiBaseUrl}/api/admin/overview`, {
      headers: { Cookie: newCookieHeader },
    });
    assert.equal(postLogoutOv.status, 401);
  });

  it('3. User engagement endpoints: Face-Off voting (1 per user), Reminders CRUD, Collections CRUD, Preferences PATCH', async () => {
    const authHeader = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${testUserToken}`,
    };

    // Preferences PATCH persists custom theme & reduced motion
    const prefRes = await fetch(`${apiBaseUrl}/api/user/preferences`, {
      method: 'PATCH',
      headers: authHeader,
      body: JSON.stringify({ visualTheme: 'aurora', compactMode: true, reducedMotion: true }),
    });
    assert.equal(prefRes.status, 200);
    const prefJson = (await prefRes.json()) as any;
    assert.equal(prefJson.preferences.visualTheme, 'aurora');
    assert.equal(prefJson.preferences.compactMode, true);

    // Premiere Reminder save + duplicate update + delete
    const remRes = await fetch(`${apiBaseUrl}/api/user/reminders`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({
        anilistId: 154587,
        animeTitle: 'Frieren',
        animeSlug: 'frieren-154587',
        airingAt: Math.floor(Date.now() / 1000) + 3600,
        episode: 28,
      }),
    });
    assert.equal(remRes.status, 200);

    const listRemRes = await fetch(`${apiBaseUrl}/api/user/reminders`, { headers: authHeader });
    assert.equal(listRemRes.status, 200);
    const listRemJson = (await listRemRes.json()) as any;
    assert.ok(listRemJson.reminders.some((r: any) => r.anilistId === 154587));

    const delRemRes = await fetch(`${apiBaseUrl}/api/user/reminders/154587`, {
      method: 'DELETE',
      headers: authHeader,
    });
    assert.equal(delRemRes.status, 200);

    // Private Collection create + update + delete
    const colRes = await fetch(`${apiBaseUrl}/api/user/collections`, {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({ title: 'Test Shelf', description: 'Top fantasy', isPrivate: true }),
    });
    assert.equal(colRes.status, 201);
    const colJson = (await colRes.json()) as any;
    const colId = colJson.collection.id;

    const patchCol = await fetch(`${apiBaseUrl}/api/user/collections/${colId}`, {
      method: 'PATCH',
      headers: authHeader,
      body: JSON.stringify({ addAnilistId: 154587 }),
    });
    assert.equal(patchCol.status, 200);
    const patchColJson = (await patchCol.json()) as any;
    assert.ok(patchColJson.collection.anilistIds.includes(154587));

    const delCol = await fetch(`${apiBaseUrl}/api/user/collections/${colId}`, {
      method: 'DELETE',
      headers: authHeader,
    });
    assert.equal(delCol.status, 200);

    // User Universe Summary returns real stats & achievements array
    const sumRes = await fetch(`${apiBaseUrl}/api/user/universe-summary`, { headers: authHeader });
    assert.equal(sumRes.status, 200);
    const sumJson = (await sumRes.json()) as any;
    assert.ok(Array.isArray(sumJson.achievements));
    assert.equal(typeof sumJson.stats.episodesLogged, 'number');

    // Public Anime Discovery endpoints
    const cfgRes = await fetch(`${apiBaseUrl}/api/anime/universe-config`);
    assert.equal(cfgRes.status, 200);

    const colPubRes = await fetch(`${apiBaseUrl}/api/anime/collections`);
    assert.equal(colPubRes.status, 200);
    const colPubJson = (await colPubRes.json()) as any;
    assert.equal(colPubJson.collections.length >= 8, true);

    const faceOffRes = await fetch(`${apiBaseUrl}/api/anime/faceoff`, { headers: authHeader });
    assert.equal(faceOffRes.status, 200);
    const faceOffJson = (await faceOffRes.json()) as any;
    if (faceOffJson.matchup?.id) {
      const vote1 = await fetch(`${apiBaseUrl}/api/user/faceoff-vote`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
          matchupId: faceOffJson.matchup.id,
          winnerAnilistId: faceOffJson.matchup.animeA.id,
        }),
      });
      assert.equal(vote1.status, 200);

      // Duplicate vote for same matchup must fail cleanly with 400
      const vote2 = await fetch(`${apiBaseUrl}/api/user/faceoff-vote`, {
        method: 'POST',
        headers: authHeader,
        body: JSON.stringify({
          matchupId: faceOffJson.matchup.id,
          winnerAnilistId: faceOffJson.matchup.animeB.id,
        }),
      });
      assert.equal(vote2.status, 400);
    }
  });

  it('4. Administrator session accesses user panels (/api/user/*) without separate member sign-in, while unauthenticated visitors remain blocked (401)', async () => {
    const unauthLib = await fetch(`${apiBaseUrl}/api/user/library`);
    assert.equal(unauthLib.status, 401);

    const adminLogin = await fetch(`${apiBaseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: TEST_ROTATED_ADMIN_PWD }),
    });
    assert.equal(adminLogin.status, 200);
    const adminCookies = parseSetCookies(adminLogin.headers);
    assert.ok(adminCookies.aniverve_admin_session);
    const adminCookieHeader = `aniverve_admin_session=${adminCookies.aniverve_admin_session}; aniverve_admin_csrf=${adminCookies.aniverve_admin_csrf}`;

    try {
      const libRes = await fetch(`${apiBaseUrl}/api/user/library`, {
        headers: { Cookie: adminCookieHeader },
      });
      assert.equal(libRes.status, 200);

      const wlRes = await fetch(`${apiBaseUrl}/api/user/watchlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookieHeader,
        },
        body: JSON.stringify({
          anilistId: 154587,
          animeTitle: 'Frieren: Beyond Journey\'s End',
          animeSlug: 'frieren-154587',
          status: 'WATCHING',
          episodesWatched: 3,
        }),
      });
      assert.equal(wlRes.status, 200);
      const wlJson = (await wlRes.json()) as any;
      assert.equal(wlJson.item.userId, 'administrator');

      const sumRes = await fetch(`${apiBaseUrl}/api/user/universe-summary`, {
        headers: { Cookie: adminCookieHeader },
      });
      assert.equal(sumRes.status, 200);
      const sumJson = (await sumRes.json()) as any;
      assert.ok(sumJson.stats.watchingCount >= 1);

      const delWlRes = await fetch(`${apiBaseUrl}/api/user/watchlist/154587`, {
        method: 'DELETE',
        headers: { Cookie: adminCookieHeader },
      });
      assert.equal(delWlRes.status, 200);
    } finally {
      await fetch(`${apiBaseUrl}/api/admin/logout`, {
        method: 'POST',
        headers: { Cookie: adminCookieHeader },
      });
    }
  });
});
