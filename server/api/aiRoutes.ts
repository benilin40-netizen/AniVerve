import { Router } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { cleanEnv } from '../utils/env.ts';
import { getCached, setCached } from '../services/cacheService.ts';
import {
  exploreAnime,
  getAnimeDetails,
  getHomeCollections,
} from '../services/anilistService.ts';
import { rateLimiters } from '../middleware/rateLimit.ts';
import {
  aiMoodPickSchema,
  aiNaturalSearchSchema,
  validateBody,
} from '../validation/schemas.ts';
import { getPrimaryTitle } from '../../src/utils/slug.ts';
import { stripHtml } from '../../src/utils/formatters.ts';
import type { AnimeSummary } from '../../src/types/anime.ts';

const router = Router();
router.use(rateLimiters.ai);

const GEMINI_MODEL = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = cleanEnv(process.env.GEMINI_API_KEY);
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function heuristicFilterParse(query: string): {
  search?: string;
  genre?: string;
  format?: string;
  sort?: string;
  explanation: string;
} {
  const lower = query.toLowerCase();
  const knownGenres = [
    'Action',
    'Adventure',
    'Comedy',
    'Drama',
    'Fantasy',
    'Horror',
    'Mystery',
    'Psychological',
    'Romance',
    'Sci-Fi',
    'Slice of Life',
    'Sports',
    'Supernatural',
    'Thriller',
  ];
  const matchedGenre = knownGenres.find((g) => lower.includes(g.toLowerCase()));
  const format = lower.includes('movie') || lower.includes('film') ? 'MOVIE' : undefined;
  const sort =
    lower.includes('top') || lower.includes('best') || lower.includes('highest')
      ? 'SCORE_DESC'
      : lower.includes('popular')
        ? 'POPULARITY_DESC'
        : 'TRENDING_DESC';

  return {
    search: query.replace(/\b(short|dark|anime|like|movies?|series|top|best)\b/gi, '').trim().slice(0, 80) || undefined,
    genre: matchedGenre,
    format,
    sort,
    explanation: matchedGenre
      ? `Filtered catalog by ${matchedGenre}${format ? ` (${format})` : ''}.`
      : `Searched live catalog matching "${query}".`,
  };
}

router.post('/nl-search', validateBody(aiNaturalSearchSchema), async (req, res) => {
  const query = req.body.query as string;
  const cacheKey = `ai:nl-search:${query.toLowerCase()}`;
  const cached = getCached<any>(cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  let parsedParams = heuristicFilterParse(query);
  const ai = getGeminiClient();

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Translate this anime discovery request into AniList catalog filters. User request: "${query}"`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              search: { type: Type.STRING, description: 'Short keyword phrase or anime title, empty if purely mood/genre' },
              genre: { type: Type.STRING, description: 'Single AniList genre like Action, Mystery, Romance, Sci-Fi, Psychological, Comedy, Drama, Fantasy, Thriller, Horror, Slice of Life, Adventure, Sports, Supernatural' },
              format: { type: Type.STRING, description: 'TV, MOVIE, OVA, ONA, or empty' },
              sort: { type: Type.STRING, description: 'SCORE_DESC, POPULARITY_DESC, TRENDING_DESC, or SEARCH_MATCH' },
              explanation: { type: Type.STRING, description: 'Concise 1-sentence explanation of why these matches fit' },
            },
            required: ['explanation'],
          },
        },
      });
      const rawText = response.text?.trim();
      if (rawText) {
        const obj = JSON.parse(rawText);
        parsedParams = {
          search: typeof obj.search === 'string' && obj.search.trim() ? obj.search.trim().slice(0, 80) : undefined,
          genre: typeof obj.genre === 'string' && obj.genre.trim() ? obj.genre.trim() : undefined,
          format: ['TV', 'MOVIE', 'OVA', 'ONA'].includes(obj.format) ? obj.format : undefined,
          sort: ['SCORE_DESC', 'POPULARITY_DESC', 'TRENDING_DESC', 'SEARCH_MATCH'].includes(obj.sort)
            ? obj.sort
            : 'SCORE_DESC',
          explanation:
            typeof obj.explanation === 'string' && obj.explanation.trim()
              ? obj.explanation.trim().slice(0, 180)
              : parsedParams.explanation,
        };
      }
    } catch {
      // Fallback cleanly to deterministic keyword & genre parser
    }
  }

  try {
    const exploreResult = await exploreAnime({
      search: parsedParams.search,
      genre: parsedParams.genre,
      format: parsedParams.format,
      sort: parsedParams.sort || 'SCORE_DESC',
      page: 1,
      perPage: 12,
    });
    const payload = {
      filters: parsedParams,
      results: exploreResult.media,
      aiEnhanced: Boolean(ai),
      cached: false,
    };
    setCached(cacheKey, payload, 600);
    return res.json(payload);
  } catch (err) {
    return res.status(502).json({
      error: err instanceof Error ? err.message : 'Unable to execute catalog search.',
    });
  }
});

router.get('/summary/:anilistId', async (req, res) => {
  const id = Number(req.params.anilistId);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Valid AniList ID is required.' });
  }

  const cacheKey = `ai:summary:${id}`;
  const cached = getCached<{ summary: string; themes: string[]; aiEnhanced: boolean }>(cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  const anime = await getAnimeDetails(id);
  if (!anime) {
    return res.status(404).json({ error: 'Anime not found.' });
  }

  const title = getPrimaryTitle(anime.title);
  const cleanSynopsis = stripHtml(anime.description).slice(0, 900);
  const genres = (anime.genres || []).slice(0, 5);
  const ai = getGeminiClient();

  let summary = cleanSynopsis
    ? `${cleanSynopsis.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ')} Ideal if you enjoy ${genres.join(', ') || 'character-driven anime'}.`
    : `${title} blends ${genres.join(', ') || 'immersive world-building'} into a tightly paced ${anime.format || 'series'} experience.`;
  let themes = genres.slice(0, 3);
  let aiEnhanced = false;

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `Write a strictly spoiler-free 2-sentence pitch for anime newcomers plus 3 concise tone tags based only on this public metadata. Title: ${title}. Genres: ${genres.join(', ')}. Format: ${anime.format || 'TV'}. Synopsis excerpt: ${cleanSynopsis}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING, description: '2 concise spoiler-free sentences describing the premise and appeal.' },
              themes: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['summary', 'themes'],
          },
        },
      });
      const parsed = response.text ? JSON.parse(response.text) : null;
      if (parsed?.summary) {
        summary = String(parsed.summary).trim().slice(0, 420);
        if (Array.isArray(parsed.themes) && parsed.themes.length > 0) {
          themes = parsed.themes.slice(0, 4).map((t: unknown) => String(t).slice(0, 32));
        }
        aiEnhanced = true;
      }
    } catch {
      // Fall back safely to curated metadata pitch
    }
  }

  const result = { summary, themes, aiEnhanced };
  setCached(cacheKey, result, 60 * 60 * 12);
  return res.json({ ...result, cached: false });
});

router.post('/mood-pick', validateBody(aiMoodPickSchema), async (req, res) => {
  const { mood, excludeGenres } = req.body as { mood: string; excludeGenres: string[] };
  const cacheKey = `ai:mood:${mood.toLowerCase()}:${excludeGenres.join(',').toLowerCase()}`;
  const cached = getCached<any>(cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  const home = await getHomeCollections();
  const excluded = new Set(excludeGenres.map((g) => g.toLowerCase()));
  const poolMap = new Map<number, AnimeSummary>();
  for (const item of [...home.trending, ...home.topRated, ...home.seasonal, ...home.popular]) {
    if ((item.genres || []).some((g: string) => excluded.has(g.toLowerCase()))) continue;
    poolMap.set(item.id, item);
  }
  const pool = Array.from(poolMap.values()).slice(0, 28);
  let picks = pool.slice(0, 6);
  let rationale = `Curated from live trending and top-rated AniList titles for a "${mood}" mood.`;
  let aiEnhanced = false;

  const ai = getGeminiClient();
  if (ai && pool.length > 0) {
    try {
      const compactCatalog = pool.map((a) => ({
        id: a.id,
        title: getPrimaryTitle(a.title),
        genres: (a.genres || []).slice(0, 4),
        score: a.averageScore,
        format: a.format,
      }));
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: `From ONLY this verified JSON catalog list, pick 4-6 anime IDs that best match the mood "${mood}". Catalog: ${JSON.stringify(compactCatalog)}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              ids: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              rationale: { type: Type.STRING },
            },
            required: ['ids', 'rationale'],
          },
        },
      });
      const parsed = response.text ? JSON.parse(response.text) : null;
      if (parsed && Array.isArray(parsed.ids)) {
        const chosen = parsed.ids
          .map((id: unknown) => poolMap.get(Number(id)))
          .filter((item: AnimeSummary | undefined): item is AnimeSummary => Boolean(item));
        if (chosen.length >= 2) {
          picks = chosen.slice(0, 6);
          if (typeof parsed.rationale === 'string' && parsed.rationale.trim()) {
            rationale = parsed.rationale.trim().slice(0, 220);
          }
          aiEnhanced = true;
        }
      }
    } catch {
      // Keep deterministic live catalog picks
    }
  }

  const payload = { picks, rationale, aiEnhanced, cached: false };
  setCached(cacheKey, payload, 600);
  return res.json(payload);
});

export default router;
