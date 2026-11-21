export function stripHtml(html?: string | null): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatScore(score?: number | null): string {
  if (score === null || score === undefined || Number.isNaN(score)) return 'N/A';
  return `${score}%`;
}

export function formatMalScore(score?: number | null): string {
  if (score === null || score === undefined || Number.isNaN(score)) return 'N/A';
  return score.toFixed(2);
}

export function formatStatus(status?: string | null): string {
  switch (status) {
    case 'RELEASING':
      return 'Airing';
    case 'FINISHED':
      return 'Completed';
    case 'NOT_YET_RELEASED':
      return 'Upcoming';
    case 'CANCELLED':
      return 'Cancelled';
    case 'HIATUS':
      return 'On Hiatus';
    default:
      return status || 'Unknown';
  }
}

export function formatFormat(format?: string | null): string {
  switch (format) {
    case 'TV':
      return 'TV';
    case 'TV_SHORT':
      return 'TV Short';
    case 'MOVIE':
      return 'Movie';
    case 'SPECIAL':
      return 'Special';
    case 'OVA':
      return 'OVA';
    case 'ONA':
      return 'ONA';
    case 'MUSIC':
      return 'Music';
    default:
      return format || 'TV';
  }
}

export function formatSeason(season?: string | null, year?: number | null): string {
  if (!season && !year) return 'TBA';
  const s = season ? season.charAt(0) + season.slice(1).toLowerCase() : '';
  return [s, year].filter(Boolean).join(' ');
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatFuzzyDate(date?: { year?: number | null; month?: number | null; day?: number | null } | null): string {
  if (!date?.year) return '';
  if (!date.month || date.month < 1 || date.month > 12) return String(date.year);
  const monthLabel = SHORT_MONTHS[date.month - 1];
  if (!date.day) return `${monthLabel} ${date.year}`;
  return `${monthLabel} ${date.day}, ${date.year}`;
}

export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTimeAgo(timestampSec: number): string {
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - timestampSec);
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `Updated ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

export function formatDuration(mins?: number | null): string {
  if (!mins || mins <= 0) return '24m';
  return `${mins}m`;
}

