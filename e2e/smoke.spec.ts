import { test, expect } from '@playwright/test';

test.describe('AniVerve Public Discovery & Navigation Smoke', () => {
  test('loads homepage without global login gate', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login$/);
    await expect(page.locator('#main-content')).toBeVisible();
    await expect(page.getByRole('link', { name: /Explore/i }).first()).toBeVisible();
  });

  test('navigates to Explore and opens Command Palette with keyboard shortcut', async ({
    page,
  }) => {
    await page.goto('/explore');
    await expect(page.getByRole('heading', { name: /Browse Anime Catalog/i })).toBeVisible();

    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: /AniVerve Command Palette/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /AniVerve Command Palette/i })).toBeHidden();
  });

  test('exposes valid robots.txt and XML sitemap routes', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    const robotsBody = await robots.text();
    expect(robotsBody).toContain('Disallow: /admin/login');
    expect(robotsBody).toContain('Disallow: /watch/');

    const sitemap = await request.get('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    const sitemapBody = await sitemap.text();
    expect(sitemapBody).toContain('http://www.sitemaps.org/schemas/sitemap/0.9');
  });
});
