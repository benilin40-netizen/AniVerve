export type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED';
export type WatchStatus = 'WATCHING' | 'COMPLETED' | 'PLAN_TO_WATCH' | 'DROPPED' | 'ON_HOLD';

export interface UserProfile {
  id: string;
  uid?: string;
  email: string;
  username: string;
  avatarUrl?: string | null;
  bio?: string | null;
  role: UserRole;
  status: AccountStatus;
  emailVerified: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface AnimeTitle {
  romaji: string;
  english?: string | null;
  native?: string | null;
  userPreferred?: string | null;
}

export interface AnimeCoverImage {
  extraLarge?: string | null;
  large?: string | null;
  medium?: string | null;
  color?: string | null;
}

export interface AnimeDate {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}

export interface AnimeTrailer {
  id?: string | null;
  site?: string | null;
  thumbnail?: string | null;
}

export interface AnimeStudio {
  id: number;
  name: string;
  isAnimationStudio?: boolean;
}

export interface AnimeCharacterEdge {
  id?: number;
  role: string;
  node: {
    id: number;
    name: { full: string; native?: string | null };
    image?: { large?: string | null; medium?: string | null };
  };
  voiceActors?: Array<{
    id: number;
    name: { full: string };
    languageV2?: string;
    image?: { medium?: string | null };
  }>;
}

export interface AnimeStaffEdge {
  id?: number;
  role: string;
  node: {
    id: number;
    name: { full: string };
    image?: { medium?: string | null };
  };
}

export interface AnimeRelationEdge {
  id?: number;
  relationType: string;
  node: AnimeSummary;
}

export interface AnimeRecommendationNode {
  id: number;
  rating: number;
  mediaRecommendation: AnimeSummary | null;
}

export interface NextAiringEpisode {
  id?: number;
  airingAt: number;
  timeUntilAiring: number;
  episode: number;
}

export interface AnimeSummary {
  id: number;
  idMal?: number | null;
  malScore?: number | null;
  slug: string;
  title: AnimeTitle;
  format?: string | null;
  status?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  startDate?: AnimeDate | null;
  episodes?: number | null;
  duration?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
  genres?: string[];
  coverImage?: AnimeCoverImage;
  bannerImage?: string | null;
  description?: string | null;
  nextAiringEpisode?: NextAiringEpisode | null;
  trailer?: AnimeTrailer | null;
  studios?: { nodes: AnimeStudio[] };
  isAdult?: boolean;
  latestEpisode?: number | null;
  airingAt?: number | null;
}

export interface AnimeTag {
  id: number;
  name: string;
  description?: string | null;
  category?: string | null;
  rank?: number | null;
  isGeneralSpoiler?: boolean;
  isMediaSpoiler?: boolean;
  isAdult?: boolean;
}

export interface AnimeIdMapping {
  anilistId: number;
  malId: number | null;
  slug: string;
  title: AnimeTitle;
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
  source: 'anilist' | 'cache-fallback';
  fetchedAt: string;
}

export interface AnimeDetail extends AnimeSummary {
  startDate?: AnimeDate;
  endDate?: AnimeDate;
  source?: string | null;
  countryOfOrigin?: string | null;
  meanScore?: number | null;
  favourites?: number | null;
  tags?: AnimeTag[];
  streamingEpisodes?: Array<{
    title?: string | null;
    thumbnail?: string | null;
    url?: string | null;
    site?: string | null;
  }>;
  characters?: { edges: AnimeCharacterEdge[] };
  staff?: { edges: AnimeStaffEdge[] };
  relations?: { edges: AnimeRelationEdge[] };
  recommendations?: { nodes: AnimeRecommendationNode[] };
}

export interface MalAnimeInfo {
  mal_id: number;
  url: string;
  title: string;
  title_english?: string | null;
  title_japanese?: string | null;
  score?: number | null;
  scored_by?: number | null;
  rank?: number | null;
  popularity?: number | null;
  members?: number | null;
  favorites?: number | null;
  rating?: string | null;
  season?: string | null;
  year?: number | null;
  studios?: Array<{ mal_id: number; name: string; url: string }>;
  genres?: Array<{ mal_id: number; name: string }>;
  relations?: Array<{
    relation: string;
    entry: Array<{ mal_id: number; type: string; name: string; url: string }>;
  }>;
  source?: string;
}

export interface AiringScheduleItem {
  id: number;
  airingAt: number;
  timeUntilAiring: number;
  episode: number;
  media: AnimeSummary;
}

export type ProviderAdapterType = 'yenime' | 'aniembed';

export type SupportedIdType = 'anilist' | 'mal';

export type ProviderAvailabilityStatus =
  | 'UNCONFIGURED'
  | 'CONFIGURED'
  | 'TESTING'
  | 'CONNECTION_FAILED'
  | 'EMBED_VERIFIED'
  | 'LICENSE_UNVERIFIED'
  | 'LICENSE_VERIFIED'
  | 'ENABLED'
  | 'DISABLED'
  | 'unconfigured'
  | 'unverified'
  | 'available'
  | 'restricted'
  | 'unreachable'
  | 'error';

export type ProviderHealthLifecycleState =
  | 'INITIALIZING'
  | 'READY'
  | 'ACTIVE'
  | 'DEGRADED'
  | 'FAILED'
  | 'RECOVERING';

export type ProviderOperationalStatus =
  | 'Healthy'
  | 'Degraded'
  | 'Temporarily unavailable'
  | 'Disabled'
  | 'Configuration error';

export type ProviderDualHealthState =
  | 'healthy'
  | 'degraded'
  | 'unavailable'
  | 'disabled'
  | 'config_error';

export interface ProviderDetailedDiagnostics {
  apiHealth: 'healthy' | 'degraded' | 'unreachable' | 'untested';
  apiHealthState?: ProviderDualHealthState;
  playbackHealthState?: ProviderDualHealthState;
  operationalStatus?: ProviderOperationalStatus;
  searchLatencyMs?: number | null;
  episodeDiscoveryStatus?: 'ok' | 'partial' | 'failed' | 'untested';
  streamResolutionStatus?: 'ok' | 'failed' | 'untested';
  subtitleAvailability?: 'vtt' | 'none' | 'unknown';
  lastTestedAt?: string | null;
}

export interface StreamingProvider {
  id: string;
  key: string;
  name: string;
  role?: 'primary' | 'backup';
  adapterType: ProviderAdapterType;
  baseUrl?: string;
  urlTemplate: string;
  supportedIdTypes: SupportedIdType[];
  supportedLanguages: string[];
  supportedFormats?: Array<'hls' | 'mp4' | 'embed'>;
  isEnabled: boolean;
  licenseVerified: boolean;
  embeddingAllowed: boolean | null;
  apiReachable?: boolean | null;
  playerInitialized?: boolean | null;
  healthState?: ProviderHealthLifecycleState;
  apiHealthState?: ProviderDualHealthState;
  playbackHealthState?: ProviderDualHealthState;
  operationalStatus?: ProviderOperationalStatus;
  consecutiveFailures?: number;
  averageResponseTimeMs?: number | null;
  cooldownUntil?: string | null;
  diagnostics?: ProviderDetailedDiagnostics;
  availabilityStatus: ProviderAvailabilityStatus;
  verificationNotes?: string | null;
  verifiedAt?: string | null;
  lastHttpStatus?: number | null;
  lastSuccessAt?: string | null;
  priority: number;
  errorCount: number;
  lastError?: string | null;
  lastCheckedAt?: string | null;
}

export interface ProviderEpisodeProbeStatus {
  providerKey: 'yenime' | 'aniembed';
  providerName: string;
  status: 'ok' | 'partial' | 'timeout' | 'error' | 'disabled' | 'no_id' | 'unverified';
  episodeCount: number;
  latencyMs: number;
  error?: string | null;
}

export interface DiscoveredEpisode {
  episodeNumber: number;
  numberLabel: string;
  title?: string | null;
  isSpecial: boolean;
  hasSub: boolean;
  hasDub: boolean;
  playable?: boolean;
  unavailableReason?: string | null;
  providers: Array<'yenime' | 'aniembed'>;
  providerMappings: {
    yenime?: {
      episodeId?: number | string;
      malId?: number | null;
      anilistId?: number;
      anikotoId?: string | null;
      serversToken?: string | null;
      hasSub: boolean;
      hasDub: boolean;
    };
    aniembed?: {
      anilistId: number;
      episode: number;
      verified: boolean;
      hasSub: boolean;
      hasDub: boolean;
    };
  };
}

export interface EpisodeDiscoveryResult {
  anilistId: number;
  malId: number | null;
  title: string;
  catalogEpisodes: number | null;
  discoveredCount: number;
  discoveryStatus: 'complete' | 'partial' | 'unavailable';
  partialResults: boolean;
  providers: ProviderEpisodeProbeStatus[];
  episodes: DiscoveredEpisode[];
  cached: boolean;
  fetchedAt: string;
  notice?: string | null;
}

export interface ResolvedEpisodeSource {
  providerKey: 'yenime' | 'aniembed';
  providerName: string;
  role: 'primary' | 'backup';
  format: 'hls' | 'mp4' | 'embed';
  embedUrl: string | null;
  hlsUrl?: string | null;
  proxiedHlsUrl?: string | null;
  directPlayable?: boolean;
  directStreamHasAudio?: 'yes' | 'no' | 'unknown';
  quality?: number | string | null;
  qualityLevels?: Array<{ label: string; height?: number; bandwidth?: number }>;
  subtitles?: Array<{ file: string; label: string; kind?: string }>;
  skipData?: {
    intro?: { start: number; end: number };
    outro?: { start: number; end: number };
  } | null;
  refreshable?: boolean;
  audioTrack: 'sub' | 'dub';
  verified: boolean;
  latencyMs: number;
  serverLabel?: string | null;
}

export interface DiagnosticAttempt {
  providerKey: string;
  providerName: string;
  stage: 'configuration' | 'audio_support' | 'api_discovery' | 'stream_resolution' | 'embed_probe' | 'completed';
  httpStatus?: number | null;
  errorCategory:
    | 'none'
    | 'disabled'
    | 'config_error'
    | 'unsupported_audio'
    | 'not_found'
    | 'rate_limited'
    | 'upstream_error'
    | 'restricted'
    | 'timeout'
    | 'network_error';
  message: string;
  latencyMs: number;
}

export interface DiagnosticReport {
  animeTitle: string | null;
  anilistId: number;
  malId: number | null;
  episodeNumber: number;
  audioTrack: 'sub' | 'dub';
  requestedProvider: string | null;
  attemptedProviders: DiagnosticAttempt[];
  alternateAvailable: boolean;
  suggestedAction: string;
  generatedAt: string;
}

export interface EpisodeSourcesResponse {
  anilistId: number;
  malId: number | null;
  episodeNumber: number;
  audioTrack: 'sub' | 'dub';
  sources: ResolvedEpisodeSource[];
  preferredSource: ResolvedEpisodeSource | null;
  errors: Array<{ providerKey: string; providerName: string; message: string; status?: number }>;
  allFailed: boolean;
  diagnostics?: DiagnosticReport;
  fetchedAt: string;
}

export interface UnifiedPlaybackTelemetry {
  currentActiveServer: 'yenime' | 'aniembed' | 'none';
  lastSuccessfulInitAt: string | null;
  lastSuccessfulServer: 'yenime' | 'aniembed' | null;
  lastConfirmedPlaybackAt: string | null;
  autoFailoverEnabled: boolean;
  lastError: {
    server: string;
    message: string;
    at: string;
  } | null;
  lastFallbackEvent: {
    from: string;
    to: string;
    reason: string;
    anilistId: number;
    episode: number;
    at: string;
  } | null;
  failoverCount: number;
}

export type ProviderDiagnosticStageKey =
  | 'url_syntax'
  | 'hostname'
  | 'api_connectivity'
  | 'url_generation'
  | 'iframe_init';

export interface ProviderStageResult {
  passed: boolean | null;
  message: string;
  status?: number;
  latencyMs?: number;
}

export interface ProviderTestStages {
  urlSyntax: ProviderStageResult;
  hostname: ProviderStageResult;
  apiConnectivity: ProviderStageResult & { status: number; latencyMs: number };
  playerUrlGeneration: ProviderStageResult & { url: string | null };
  iframeInitialization: ProviderStageResult & {
    status: number;
    xFrameOptions: string | null;
    frameAncestors: string | null;
  };
}

export interface ProviderTestResult {
  providerKey: string;
  providerName: string;
  configured: boolean;
  urlValid: boolean;
  hostnameValid: boolean;
  apiReachable: boolean;
  reachable: boolean;
  embeddingAllowed: boolean;
  playerInitialized: boolean | null;
  availabilityStatus: ProviderAvailabilityStatus;
  status: number;
  latencyMs: number;
  resolvedUrl: string | null;
  xFrameOptions: string | null;
  frameAncestors: string | null;
  failedStage: ProviderDiagnosticStageKey | null;
  error: string | null;
  testedAt: string;
  stages: ProviderTestStages;
}

export interface WatchlistItem {
  id: string;
  userId: string;
  anilistId: number;
  animeTitle: string;
  animeSlug: string;
  coverImage?: string | null;
  totalEpisodes?: number | null;
  status: WatchStatus;
  episodesWatched: number;
  notes?: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface FavoriteItem {
  id: string;
  userId: string;
  anilistId: number;
  animeTitle: string;
  animeSlug: string;
  coverImage?: string | null;
  createdAt: string;
}

export interface WatchHistoryItem {
  id: string;
  userId: string;
  anilistId: number;
  animeTitle: string;
  animeSlug: string;
  coverImage?: string | null;
  episodeNumber: number;
  providerKey: string;
  language: 'sub' | 'dub';
  progressSec: number;
  durationSec: number;
  completed: boolean;
  watchedAt: string;
}

export interface UserRatingItem {
  id: string;
  userId: string;
  anilistId: number;
  score: number;
  review?: string | null;
  updatedAt: string;
}

export interface SystemSettings {
  siteName: string;
  logoUrl?: string;
  faviconUrl?: string;
  accentColor: string;
  maintenanceMode: boolean;
  allowRegistration: boolean;
  seoTitle: string;
  seoDescription: string;
  featuredSections: string[];
}

export interface DataProvenanceMeta {
  source: 'anilist' | 'jikan' | 'cache-fallback';
  fetchedAt: string;
  isStale: boolean;
  notice?: string | null;
}

export interface MalFetchMeta {
  status: 'verified_api' | 'cached_stale' | 'unavailable' | 'no_mal_id';
  fetchedAt: string | null;
  error?: string | null;
}

export interface UserSessionInfo {
  id: string;
  createdAt: string;
  expiresAt: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  current: boolean;
}

export interface ErrorLogEntry {
  id: string;
  requestId?: string | null;
  source: string;
  route?: string | null;
  statusCode?: number | null;
  message: string;
  createdAt: string;
}

export interface SecurityLogEntry {
  id: string;
  userId?: string | null;
  email?: string | null;
  event: string;
  success: boolean;
  ipAddress?: string | null;
  details?: string | null;
  createdAt: string;
}

export interface DatabaseBackupInfo {
  filename: string;
  createdAt: string;
  sizeBytes: number;
  recordCounts: Record<string, number>;
}

export interface AnimeCharacterSpotlight {
  id: number;
  name: string;
  nativeName?: string | null;
  image?: string | null;
  favourites?: number | null;
  description?: string | null;
  role?: string | null;
  anime: AnimeSummary[];
}

export interface CuratedCollection {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  themeTag: string;
  accentHex?: string | null;
  anilistIds: number[];
  items?: AnimeSummary[];
  isOfficial: boolean;
  published: boolean;
  sortOrder: number;
  updatedAt?: string;
}

export interface UserCollection {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  anilistIds: number[];
  items?: AnimeSummary[];
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PremiereReminder {
  id: string;
  userId: string;
  anilistId: number;
  animeTitle: string;
  animeSlug: string;
  coverImage?: string | null;
  airingAt?: number | null;
  episode?: number | null;
  createdAt: string;
}

export interface FaceOffMatchup {
  id: string;
  weekKey: string;
  title: string;
  animeA: AnimeSummary;
  animeB: AnimeSummary;
  votesA: number;
  votesB: number;
  totalVotes: number;
  userVoteAnilistId: number | null;
}

export type UniverseVisualTheme = 'midnight-violet' | 'obsidian' | 'aurora' | 'eclipse';

export interface UniversePreferences {
  visualTheme: UniverseVisualTheme;
  customAccentHex: string;
  compactMode: boolean;
  reducedMotion: boolean;
  personalizationEnabled: boolean;
  profilePublic: boolean;
  hideAchievements: boolean;
  updatedAt?: string;
}

export type HomepageSectionKey =
  | 'spotlight'
  | 'surpriseMe'
  | 'trendingRankings'
  | 'discoveryRadar'
  | 'moodDiscovery'
  | 'premiereCountdown'
  | 'faceOff'
  | 'characterSpotlight'
  | 'trailerSpotlight'
  | 'collections'
  | 'seasonal'
  | 'airing'
  | 'popular'
  | 'recentlyUpdated'
  | 'upcoming'
  | 'movies';

export interface HomepageUniverseConfig {
  id: 'homepage';
  heroMode: 'spotlight-slider' | 'minimal' | 'announcement';
  announcementBanner: {
    enabled: boolean;
    title: string;
    message: string;
    linkUrl?: string | null;
    linkLabel?: string | null;
  };
  animeOfTheDayOverrideId?: number | null;
  featuredCollectionIds: string[];
  featuredPremiereIds: number[];
  featuredTrailerAnimeId?: number | null;
  faceOffOverrideIds?: [number, number] | null;
  sectionOrder: HomepageSectionKey[];
  hiddenSections: HomepageSectionKey[];
  particleDensity: 'minimal' | 'balanced' | 'cinematic';
  cardDensity: 'comfortable' | 'compact';
  draft?: Partial<Omit<HomepageUniverseConfig, 'id' | 'draft' | 'publishedAt' | 'updatedAt'>> | null;
  publishedAt: string;
  updatedAt: string;
}

export interface AnimeOfTheDayPayload {
  dateKey: string;
  timezone: string;
  anime: AnimeSummary;
  reasons: string[];
  isAdminOverride: boolean;
}

export interface UniversalSearchResult {
  query: string;
  anime: AnimeSummary[];
  characters: AnimeCharacterSpotlight[];
  studios: Array<{ id: number; name: string; animeCount?: number; topAnime: AnimeSummary[] }>;
  genres: string[];
  collections: CuratedCollection[];
}

export interface AdminSessionInfo {
  authenticated: boolean;
  mustChangePassword: boolean;
  sessionId?: string;
  expiresAt?: string;
  csrfToken?: string;
  usingEnvPassword?: boolean;
  authMode: 'backend-password';
}

export type DiscoveryCategoryKey =
  | 'topRated'
  | 'mostWatched'
  | 'hiddenGems'
  | 'bestRomance'
  | 'bestAction'
  | 'fantasyIsekai'
  | 'mysteryThriller'
  | 'comedySliceOfLife'
  | 'sciFiSupernatural'
  | 'classicAnime'
  | 'newReleases';

export interface HomeDiscoveryCategory {
  key: DiscoveryCategoryKey;
  title: string;
  subtitle: string;
  exploreQuery: string;
  items: AnimeSummary[];
}

export interface AdminNotificationItem {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category: 'provider' | 'security' | 'system' | 'content';
  title: string;
  message: string;
  acknowledged: boolean;
  createdAt: string;
}

export interface WatchlistEpisodeNotification {
  id: string;
  anilistId: number;
  animeTitle: string;
  animeSlug: string;
  coverImage?: string | null;
  bannerImage?: string | null;
  format?: string | null;
  mediaStatus?: string | null;
  watchStatus: WatchStatus;
  latestAiredEpisode: number;
  nextUnwatchedEpisode: number;
  newEpisodesCount: number;
  episodesWatched: number;
  totalEpisodes?: number | null;
  airedAt: number | null;
  nextAiringEpisode?: NextAiringEpisode | null;
  isRead: boolean;
}

export interface WatchlistNotificationPreferences {
  includePlanToWatch: boolean;
  includeOnHold: boolean;
}

export interface WatchlistNotificationStateRecord {
  id: string;
  userId: string;
  readIds: string[];
  dismissedIds: string[];
  includePlanToWatch: boolean;
  includeOnHold: boolean;
  lastCheckedAt: string;
  updatedAt: string;
}

export interface WatchlistNotificationsResponse {
  notifications: WatchlistEpisodeNotification[];
  unreadCount: number;
  monitoredCount: number;
  preferences: WatchlistNotificationPreferences;
  checkedAt: string;
}

