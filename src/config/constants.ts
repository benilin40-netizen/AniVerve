import fallbackAnimeBanner from '../assets/images/fallback_anime_banner.webp';
import fallbackAnimeBanner640 from '../assets/images/fallback_anime_banner_640.webp';
import fallbackNewsCover from '../assets/images/fallback_news_cover.webp';
import fallbackNewsCover640 from '../assets/images/fallback_news_cover_640.webp';

export const ANIME_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
] as const;

export const ANIME_FORMATS = [
  { value: 'TV', label: 'TV Series' },
  { value: 'MOVIE', label: 'Movie' },
  { value: 'OVA', label: 'OVA' },
  { value: 'ONA', label: 'ONA' },
  { value: 'SPECIAL', label: 'Special' },
] as const;

export const ANIME_SEASONS = [
  { value: 'WINTER', label: 'Winter' },
  { value: 'SPRING', label: 'Spring' },
  { value: 'SUMMER', label: 'Summer' },
  { value: 'FALL', label: 'Fall' },
] as const;

export const ANIME_STATUSES = [
  { value: 'RELEASING', label: 'Currently Airing' },
  { value: 'FINISHED', label: 'Finished Airing' },
  { value: 'NOT_YET_RELEASED', label: 'Upcoming' },
] as const;

export const WATCH_STATUS_LABELS: Record<string, string> = {
  WATCHING: 'Watching',
  COMPLETED: 'Completed',
  PLAN_TO_WATCH: 'Plan to Watch',
  ON_HOLD: 'On Hold',
  DROPPED: 'Dropped',
};

export const FALLBACK_BANNER_IMAGE = fallbackAnimeBanner;
export const FALLBACK_BANNER_IMAGE_640 = fallbackAnimeBanner640;
export const FALLBACK_NEWS_IMAGE = fallbackNewsCover;
export const FALLBACK_NEWS_IMAGE_640 = fallbackNewsCover640;

export const DESIGN_TOKENS = {
  colors: {
    bgPrimary: '#09090F',
    bgSecondary: '#11111B',
    bgCard: '#171722',
    accentPrimary: '#7C5CFF',
    accentLight: '#9B87FF',
  },
  motion: {
    fastMs: 160,
    baseMs: 240,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },
  layout: {
    maxContainerPx: 1440,
    minTapTargetPx: 44,
  },
} as const;

export const LEGAL_LAST_UPDATED = 'November 2026';

export function getCurrentAnimeSeason(): { season: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'; year: number } {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 1 && month <= 3) return { season: 'WINTER', year };
  if (month >= 4 && month <= 6) return { season: 'SPRING', year };
  if (month >= 7 && month <= 9) return { season: 'SUMMER', year };
  return { season: 'FALL', year };
}
