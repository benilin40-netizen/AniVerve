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

export const FALLBACK_BANNER_IMAGE = '/src/assets/images/fallback_anime_banner_1794694279692.jpg';
export const FALLBACK_NEWS_IMAGE = '/src/assets/images/fallback_news_cover_1794694280417.jpg';

export function getCurrentAnimeSeason(): { season: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'; year: number } {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 1 && month <= 3) return { season: 'WINTER', year };
  if (month >= 4 && month <= 6) return { season: 'SPRING', year };
  if (month >= 7 && month <= 9) return { season: 'SUMMER', year };
  return { season: 'FALL', year };
}
