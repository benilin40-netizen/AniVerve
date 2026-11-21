import type { AnimeTitle } from '../types/anime.ts';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 90) || 'anime';
}

export function buildAnimeSlug(id: number, title?: AnimeTitle | string | null): string {
  const raw =
    typeof title === 'string'
      ? title
      : title?.english || title?.romaji || title?.userPreferred || title?.native || 'anime';
  return `${id}-${slugify(raw)}`;
}

export function parseAnimeIdFromSlug(slugOrId: string): number | null {
  if (!slugOrId) return null;
  const trimmed = slugOrId.trim();
  const direct = Number(trimmed);
  if (Number.isInteger(direct) && direct > 0) return direct;
  const leadingMatch = trimmed.match(/^(\d+)(?:-|$)/);
  if (leadingMatch) {
    const parsed = Number(leadingMatch[1]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  const trailingMatch = trimmed.match(/(?:^|-)(\d+)$/);
  if (trailingMatch) {
    const parsed = Number(trailingMatch[1]);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function getPrimaryTitle(title?: AnimeTitle | null): string {
  if (!title) return 'Untitled Anime';
  return title.english || title.romaji || title.userPreferred || title.native || 'Untitled Anime';
}
