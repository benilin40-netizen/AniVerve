import type {
  AdminNotificationItem,
  AnimeSummary,
  DatabaseBackupInfo,
  ErrorLogEntry,
  HomepageSectionKey,
  SecurityLogEntry,
} from '../../../types/anime.ts';

export type AdminSectionId =
  | 'overview'
  | 'users'
  | 'catalog'
  | 'content'
  | 'providers'
  | 'monitoring'
  | 'database'
  | 'security'
  | 'analytics'
  | 'notifications'
  | 'appearance'
  | 'settings';

export interface ActiveAdminSessionRecord {
  id: string;
  createdAt: string;
  expiresAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  current: boolean;
}

export interface AnalyticsPayload {
  totals: {
    users: number;
    watchlists: number;
    favorites: number;
    historyEvents: number;
    ratings: number;
    reminders: number;
    userCollections: number;
    faceOffVotes: number;
  };
  statusBreakdown: Record<string, number>;
  topTrackedAnime: Array<{ anilistId: number; title: string; count: number }>;
}

export interface ApiMetricEntry {
  source: string;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  lastLatencyMs: number;
  lastStatus: string;
}

export interface JobStatusEntry {
  name: string;
  lastRunAt?: string | null;
  status: string;
}

export interface ActivityAuditEntry {
  id: string;
  action: string;
  target: string;
  createdAt: string;
}

export interface AdminOverviewPayload {
  stats: {
    totalUsers: number;
    totalWatchlistEntries: number;
    totalWatchHistory: number;
    activeProviders: number;
    totalProviders: number;
  };
  cacheStats?: {
    activeEntries?: number;
    metrics?: ApiMetricEntry[];
  };
  recentActivities?: ActivityAuditEntry[];
  jobs?: JobStatusEntry[];
  errorLogs?: ErrorLogEntry[];
  securityLogs?: SecurityLogEntry[];
  backups?: DatabaseBackupInfo[];
  dbHealth?: {
    mode?: string;
    firestoreConfigured?: boolean;
  };
}

export interface CatalogOverrideRecord {
  id: string;
  anilistId: number;
  featured: boolean;
  hidden: boolean;
  anime?: AnimeSummary | null;
}

export const SECTION_LABELS: Record<HomepageSectionKey, string> = {
  spotlight: "Today's Anime Spotlight",
  surpriseMe: 'Surprise Me Discovery',
  trendingRankings: 'Trending Right Now (#1–#10)',
  discoveryRadar: 'AniVerve Discovery Radar',
  moodDiscovery: 'Mood-Based Discovery',
  premiereCountdown: 'Season Premiere Countdown',
  collections: 'Official Anime Collections',
  seasonal: 'Popular This Season Grid',
  airing: 'Currently Airing Grid',
  popular: 'All-Time Popular Grid',
  recentlyUpdated: 'Recently Updated Grid',
  faceOff: 'Anime Face-Off Voting',
  characterSpotlight: 'Character Spotlight',
  trailerSpotlight: 'Official Trailer Spotlight',
  upcoming: 'Upcoming Anime Grid',
  movies: 'Latest Anime Movies Grid',
};

export type AdminNotificationsList = AdminNotificationItem[];
