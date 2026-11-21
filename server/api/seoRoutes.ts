import { Router } from 'express';
import { getHomeCollections } from '../services/anilistService.ts';
import { cleanEnv } from '../utils/env.ts';

const router = Router();

function getBaseUrl(req: any): string {
  const appUrl = cleanEnv(process.env.APP_URL);
  if (appUrl && !appUrl.includes('MY_APP_URL')) {
    return appUrl.replace(/\/$/, '');
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

router.get('/robots.txt', (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.type('text/plain').send(
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /api/',
      'Disallow: /login',
      'Disallow: /register',
      'Disallow: /forgot-password',
      'Disallow: /verify-email',
      'Disallow: /profile',
      'Disallow: /watchlist',
      `Sitemap: ${baseUrl}/sitemap.xml`,
    ].join('\n') + '\n'
  );
});

router.get('/sitemap.xml', async (req, res) => {
  const baseUrl = getBaseUrl(req);
  const staticPaths = ['/', '/explore', '/seasonal', '/schedule', '/movies', '/popular', '/genres'];
  const todayIso = new Date().toISOString().split('T')[0];

  let animeUrls: string[] = [];

  try {
    const home = await getHomeCollections();
    const seenIds = new Set<number>();
    for (const item of [...home.trending, ...home.popular, ...home.seasonal]) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        animeUrls.push(`/anime/${item.slug}`);
      }
    }
  } catch {
    // Serve static URLs if external APIs temporarily unavailable
  }

  const allUrls = [...staticPaths, ...animeUrls];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (p) => `  <url>
    <loc>${baseUrl}${p}</loc>
    <lastmod>${todayIso}</lastmod>
    <changefreq>${p === '/' || p === '/schedule' ? 'hourly' : 'daily'}</changefreq>
  </url>`
  )
  .join('\n')}
</urlset>`;

  res.type('application/xml').send(xml);
});

export default router;
