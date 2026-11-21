import type {
  ProviderAdapterType,
  ProviderAvailabilityStatus,
  SupportedIdType,
} from '../types/anime.ts';

export type PlaybackTrack = 'sub' | 'dub';

export interface PlaybackBuildParams {
  anilistId: number;
  malId?: number | null;
  episode: number;
  track: PlaybackTrack;
  autoPlay: boolean;
  startSeconds: number;
  slug?: string;
  autoNext?: boolean;
  accent?: string;
}

export interface PlaybackValidationResult {
  valid: boolean;
  url: string | null;
  basicUrl?: string | null;
  error?: string;
  unsupportedTrack?: PlaybackTrack;
  missingIdType?: SupportedIdType;
}

export interface PlaybackProvider {
  readonly key: string;
  readonly name: string;
  readonly adapterType: ProviderAdapterType;
  readonly supportedIdTypes: readonly SupportedIdType[];
  readonly supportedTracks: readonly PlaybackTrack[];
  readonly supportsResume: boolean;
  readonly supportsAutoPlay: boolean;
  readonly isEnabled: boolean;
  readonly licenseVerified: boolean;
  readonly embeddingAllowed: boolean | null;
  readonly availabilityStatus: ProviderAvailabilityStatus;
  readonly priority: number;
  readonly errorCount: number;
  readonly lastError?: string | null;
  supportsTrack(track: PlaybackTrack): boolean;
  supportsIdType(idType: SupportedIdType): boolean;
  isActivated(): boolean;
  buildEmbedUrl(params: PlaybackBuildParams): PlaybackValidationResult;
}
