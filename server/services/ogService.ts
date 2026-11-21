import type { Request } from 'express';
import { cleanEnv } from '../utils/env.ts';
import { getAnimeDetails } from './anilistService.ts';
import { parseAnimeIdFromSlug, getPrimaryTitle } from '../../src/utils/slug.ts';
import { stripHtml } from '../../src/utils/formatters.ts';

function escapeHtmlAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function getPublicBaseUrl(req: Request): string {
  const configured = cleanEnv(process.env.APP_URL);
  if (configured && !configured.includes('MY_APP_URL')) {
    return configured.replace(/\/$/, '');
  }
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000').split(',')[0].trim();
  return `${proto}://${host}`;
}

interface DynamicPageMeta {
  title: string;
  description: string;
  canonical: string;
  ogType: string;
  image: string;
  robots?: string;
  jsonLd: Record<string, unknown>[];
}

async function resolvePageMetaForRequest(req: Request): Promise<DynamicPageMeta | null> {
  const reqPath = (req.originalUrl || req.url || '/').split('?')[0];
  const baseUrl = getPublicBaseUrl(req);
  const defaultImage = `${baseUrl}/branding/aniverve-social.png`;

  const websiteSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'AniVerve',
    url: baseUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseUrl}/explore?search={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  if (reqPath.startsWith('/anime/')) {
    const slug = reqPath.slice('/anime/'.length).replace(/\/$/, '');
    const id = parseAnimeIdFromSlug(slug);
    if (!id) return null;

    try {
      const anime = await Promise.race([
        getAnimeDetails(id),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1600)),
      ]);
      if (!anime) return null;

      const title = getPrimaryTitle(anime.title);
      const cleanDesc = stripHtml(anime.description).slice(0, 180) ||
        `Explore ${title}, episode guide, ratings, and live schedule updates on AniVerve.`;
      const canonical = `${baseUrl}/anime/${anime.slug}`;
      const image = anime.bannerImage || anime.coverImage?.extraLarge || anime.coverImage?.large || defaultImage;
      const isMovie = anime.format === 'MOVIE';

      const mediaSchema: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': isMovie ? 'Movie' : 'TVSeries',
        name: title,
        description: cleanDesc,
        url: canonical,
        image,
        genre: anime.genres?.slice(0, 6),
        ...(anime.averageScore
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: Number((anime.averageScore / 10).toFixed(1)),
                bestRating: 10,
                worstRating: 1,
                ratingCount: anime.popularity || 100,
              },
            }
          : {}),
        ...(!isMovie && anime.episodes ? { numberOfEpisodes: anime.episodes } : {}),
      };

      const breadcrumbSchema: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Explore', item: `${baseUrl}/explore` },
          { '@type': 'ListItem', position: 3, name: title, item: canonical },
        ],
      };

      return {
        title: `${title} — Details, Episodes & Ratings · AniVerve`,
        description: cleanDesc,
        canonical,
        ogType: isMovie ? 'video.movie' : 'video.tv_show',
        image,
        jsonLd: [websiteSchema, mediaSchema, breadcrumbSchema],
      };
    } catch {
      return null;
    }
  }

  const staticTitles: Record<string, { title: string; description: string; robots?: string }> = {
    '/': {
      title: 'AniVerve – Anime Discovery, Live Airing Schedule & Streaming',
      description:
        'Discover trending anime, track live airing countdowns, manage your watchlist, and stream episodes on AniVerve.',
    },
    '/explore': {
      title: 'Browse Anime Catalog · AniVerve',
      description: 'Filter live anime catalog by genre, season, release year, format, and score.',
    },
    '/schedule': {
      title: 'Live Airing Schedule & Countdowns · AniVerve',
      description: 'Track upcoming anime broadcasts calibrated to your local timezone.',
    },
    '/movies': {
      title: 'Anime Movies · AniVerve',
      description: 'Browse recent and classic theatrical anime films.',
    },
    '/genres': {
      title: 'Anime by Genre · AniVerve',
      description: 'Explore anime organized by action, fantasy, romance, sci-fi, and more.',
    },
    '/admin/login': {
      title: 'Administrator Sign In · AniVerve',
      description: 'AniVerve administrator authentication gate.',
      robots: 'noindex, nofollow',
    },
  };

  const matched = staticTitles[reqPath];
  if (matched) {
    return {
      title: matched.title,
      description: matched.description,
      canonical: `${baseUrl}${reqPath === '/' ? '' : reqPath}`,
      ogType: 'website',
      image: defaultImage,
      robots: matched.robots,
      jsonLd: [websiteSchema],
    };
  }

  return null;
}

export async function injectHtmlMetadataAndNonce(
  rawHtml: string,
  req: Request,
  cspNonce: string
): Promise<string> {
  let html = rawHtml;

  // Apply CSP nonce to inline and module script/style tags in the HTML shell
  html = html.replace(/<script(?![^>]*\bnonce=)([^>]*)>/gi, `<script nonce="${cspNonce}"$1>`);
  html = html.replace(/<style(?![^>]*\bnonce=)([^>]*)>/gi, `<style nonce="${cspNonce}"$1>`);

  const meta = await resolvePageMetaForRequest(req);
  if (!meta) return html;

  const escTitle = escapeHtmlAttr(meta.title);
  const escDesc = escapeHtmlAttr(meta.description);
  const escCanonical = escapeHtmlAttr(meta.canonical);
  const escImage = escapeHtmlAttr(meta.image);
  const escOgType = escapeHtmlAttr(meta.ogType);

  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escTitle}</title>`);
  html = html.replace(
    /<meta\s+name="description"[\s\S]*?\/?>/i,
    `<meta name="description" content="${escDesc}" />`
  );
  html = html.replace(
    /<meta\s+property="og:type"[^>]*>/i,
    `<meta property="og:type" content="${escOgType}" />`
  );
  html = html.replace(
    /<meta\s+property="og:title"[^>]*>/i,
    `<meta property="og:title" content="${escTitle}" />`
  );
  html = html.replace(
    /<meta\s+property="og:description"[\s\S]*?\/?>/i,
    `<meta property="og:description" content="${escDesc}" />`
  );
  html = html.replace(
    /<meta\s+property="og:image"[^>]*>/i,
    `<meta property="og:image" content="${escImage}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:title"[^>]*>/i,
    `<meta name="twitter:title" content="${escTitle}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:description"[\s\S]*?\/?>/i,
    `<meta name="twitter:description" content="${escDesc}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:image"[^>]*>/i,
    `<meta name="twitter:image" content="${escImage}" />`
  );

  const extraHeadTags = [
    `<link rel="canonical" href="${escCanonical}" />`,
    `<meta property="og:url" content="${escCanonical}" />`,
    meta.robots ? `<meta name="robots" content="${escapeHtmlAttr(meta.robots)}" />` : '',
  ]
    .filter(Boolean)
    .join('\n    ');

  const ldScripts = meta.jsonLd
    .map(
      (obj) =>
        `<script nonce="${cspNonce}" type="application/ld+json" data-ssr-ld="true">${escapeJsonLd(obj)}</script>`
    )
    .join('\n    ');

  html = html.replace(
    /<script[^>]*type="application\/ld\+json"[\s\S]*?<\/script>/i,
    `${extraHeadTags}\n    ${ldScripts}`
  );

  return html;
}
