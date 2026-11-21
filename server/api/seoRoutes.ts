import { Router } from 'express';
import { getHomeCollections, exploreAnime } from '../services/anilistService.ts';
import { getCached, setCached } from '../services/cacheService.ts';
import { getPublicBaseUrl } from '../services/ogService.ts';

const router = Router();
const ANIME_PER_SITEMAP_PAGE = 100;

interface SitemapEntry {
  loc: string;
  lastmod: string;
  changefreq: 'hourly' | 'daily' | 'weekly' | 'monthly';
  priority: string;
}

async function getCrawlableAnimeEntries(): Promise<SitemapEntry[]> {
  const cached = getCached<SitemapEntry[]>('seo:sitemap:anime');
  if (cached) return cached;

  const entries: SitemapEntry[] = [];
  const seenIds = new Set<number>();
  const todayIso = new Date().toISOString().split('T')[0];

  try {
    const home = await getHomeCollections();
    for (const item of [
      ...home.trending,
      ...home.seasonal,
      ...home.airing,
      ...home.popular,
      ...home.topRated,
      ...home.movies,
      ...home.upcoming,
    ]) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        entries.push({
          loc: `/anime/${item.slug}`,
          lastmod: todayIso,
          changefreq: item.status === 'RELEASING' ? 'daily' : 'weekly',
          priority: item.status === 'RELEASING' ? '0.8' : '0.7',
        });
      }
    }

    // Supplement with popular pages up to ~150 unique titles
    for (const page of [1, 2, 3]) {
      const explored = await exploreAnime({ sort: 'POPULARITY_DESC', page, perPage: 36 }).catch(
        () => null
      );
      for (const item of explored?.media || []) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          entries.push({
            loc: `/anime/${item.slug}`,
            lastmod: todayIso,
            changefreq: item.status === 'RELEASING' ? 'daily' : 'weekly',
            priority: '0.7',
          });
        }
      }
    }
  } catch {
    // Serve whatever entries succeeded cleanly
  }

  if (entries.length > 0) {
    setCached('seo:sitemap:anime', entries, 60 * 30);
  }
  return entries;
}

router.get('/robots.txt', (req, res) => {
  const baseUrl = getPublicBaseUrl(req);
  res
    .type('text/plain')
    .setHeader('Cache-Control', 'public, max-age=3600')
    .send(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /admin/login',
        'Disallow: /watch/',
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
  const baseUrl = getPublicBaseUrl(req);
  const todayIso = new Date().toISOString().split('T')[0];
  const entries = await getCrawlableAnimeEntries();
  const animePages = Math.max(1, Math.ceil(entries.length / ANIME_PER_SITEMAP_PAGE));

  const sitemaps = [
    `${baseUrl}/sitemap-static.xml`,
    ...Array.from({ length: animePages }, (_, i) => `${baseUrl}/sitemap-anime-${i + 1}.xml`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps
  .map(
    (loc) => `  <sitemap>
    <loc>${loc}</loc>
    <lastmod>${todayIso}</lastmod>
  </sitemap>`
  )
  .join('\n')}
</sitemapindex>`;

  res.type('application/xml').setHeader('Cache-Control', 'public, max-age=1800').send(xml);
});

router.get('/sitemap-static.xml', (req, res) => {
  const baseUrl = getPublicBaseUrl(req);
  const todayIso = new Date().toISOString().split('T')[0];
  const staticUrls: SitemapEntry[] = [
    { loc: '/', lastmod: todayIso, changefreq: 'hourly', priority: '1.0' },
    { loc: '/explore', lastmod: todayIso, changefreq: 'daily', priority: '0.9' },
    { loc: '/seasonal', lastmod: todayIso, changefreq: 'daily', priority: '0.9' },
    { loc: '/schedule', lastmod: todayIso, changefreq: 'hourly', priority: '0.9' },
    { loc: '/movies', lastmod: todayIso, changefreq: 'daily', priority: '0.8' },
    { loc: '/popular', lastmod: todayIso, changefreq: 'daily', priority: '0.8' },
    { loc: '/genres', lastmod: todayIso, changefreq: 'weekly', priority: '0.7' },
    { loc: '/about', lastmod: todayIso, changefreq: 'monthly', priority: '0.4' },
    { loc: '/contact', lastmod: todayIso, changefreq: 'monthly', priority: '0.4' },
    { loc: '/terms', lastmod: todayIso, changefreq: 'monthly', priority: '0.3' },
    { loc: '/privacy', lastmod: todayIso, changefreq: 'monthly', priority: '0.3' },
    { loc: '/dmca', lastmod: todayIso, changefreq: 'monthly', priority: '0.3' },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls
  .map(
    (u) => `  <url>
    <loc>${baseUrl}${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  res.type('application/xml').setHeader('Cache-Control', 'public, max-age=3600').send(xml);
});

router.get('/sitemap-anime-:page.xml', async (req, res) => {
  const baseUrl = getPublicBaseUrl(req);
  const pageNum = Math.max(1, Number(req.params.page) || 1);
  const entries = await getCrawlableAnimeEntries();
  const start = (pageNum - 1) * ANIME_PER_SITEMAP_PAGE;
  const slice = entries.slice(start, start + ANIME_PER_SITEMAP_PAGE);

  if (slice.length === 0 && pageNum > 1) {
    return res.status(404).type('text/plain').send('Sitemap page not found.');
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${slice
  .map(
    (u) => `  <url>
    <loc>${baseUrl}${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  res.type('application/xml').setHeader('Cache-Control', 'public, max-age=1800').send(xml);
});

export default router;
