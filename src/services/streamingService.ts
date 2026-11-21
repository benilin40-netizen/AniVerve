import type {
  DiagnosticReport,
  ProviderAdapterType,
  ProviderAvailabilityStatus,
  ProviderDualHealthState,
  ProviderHealthLifecycleState,
  ProviderOperationalStatus,
  ProviderTestResult,
  ResolvedEpisodeSource,
  StreamingProvider,
  SupportedIdType,
  UnifiedPlaybackTelemetry,
} from '../types/anime.ts';
import { API_TIMEOUTS, apiFetch } from './apiClient.ts';

export interface ProviderRegistrySummary {
  key: string;
  name: string;
  role?: 'primary' | 'backup';
  adapterType: ProviderAdapterType;
  supportedIdTypes: SupportedIdType[];
  supportedLanguages: string[];
  supportedFormats?: Array<'hls' | 'mp4' | 'embed'>;
  isEnabled: boolean;
  licenseVerified: boolean;
  embeddingAllowed: boolean | null;
  availabilityStatus: ProviderAvailabilityStatus;
  healthState?: ProviderHealthLifecycleState;
  apiHealthState?: ProviderDualHealthState;
  playbackHealthState?: ProviderDualHealthState;
  operationalStatus?: ProviderOperationalStatus;
  consecutiveFailures?: number;
  averageResponseTimeMs?: number | null;
  cooldownUntil?: string | null;
  priority: number;
  errorCount: number;
  lastError?: string | null;
  lastCheckedAt?: string | null;
  lastSuccessAt?: string | null;
  activated: boolean;
}

export interface ProvidersListResponse {
  providers: StreamingProvider[];
  registry: ProviderRegistrySummary[];
  primary?: StreamingProvider | null;
  backup?: StreamingProvider | null;
  telemetry?: UnifiedPlaybackTelemetry | null;
  checkedAt?: string;
}

export interface ResolvedStreamResponse {
  provider: StreamingProvider;
  backupProvider?: StreamingProvider | null;
  backupEmbedUrl?: string | null;
  availableProviders: StreamingProvider[];
  embedUrl: string | null;
  sources?: ResolvedEpisodeSource[];
  preferredSource?: ResolvedEpisodeSource | null;
  errors?: Array<{ providerKey: string; providerName: string; message: string; status?: number }>;
  diagnostics?: DiagnosticReport;
  language: 'sub' | 'dub';
  idMapping?: { anilistId: number; malId?: number | null };
}

export const streamingService = {
  async getProviderRegistry(): Promise<ProvidersListResponse> {
    const res = await apiFetch<ProvidersListResponse>('/api/providers/status', {
      timeoutMs: API_TIMEOUTS.CATALOG_MS,
    }).catch(() =>
      apiFetch<ProvidersListResponse>('/api/streaming/providers', {
        timeoutMs: API_TIMEOUTS.CATALOG_MS,
      })
    );
    return {
      providers: res.providers || [],
      registry: res.registry || [],
      primary: res.primary || null,
      backup: res.backup || null,
      telemetry: res.telemetry || null,
      checkedAt: res.checkedAt,
    };
  },

  async getProviders(): Promise<StreamingProvider[]> {
    const res = await this.getProviderRegistry();
    return res.providers;
  },

  async checkAvailability(params?: {
    anilistId?: number;
    episode?: number;
    refresh?: boolean;
  }): Promise<{
    anilistId: number;
    episode: number;
    results: ProviderTestResult[];
  }> {
    const qs = new URLSearchParams();
    if (params?.anilistId) qs.set('anilistId', String(params.anilistId));
    if (params?.episode !== undefined) qs.set('episode', String(params.episode));
    if (params?.refresh) qs.set('refresh', '1');
    return apiFetch(`/api/streaming/availability?${qs.toString()}`, {
      timeoutMs: API_TIMEOUTS.EPISODES_MS,
    });
  },

  async resolveStream(
    params: {
      anilistId: number;
      episode: number;
      provider?: string;
      lang?: 'sub' | 'dub';
      autoPlay?: boolean;
      start?: number;
    },
    signal?: AbortSignal
  ): Promise<ResolvedStreamResponse> {
    const qs = new URLSearchParams({
      anilistId: String(params.anilistId),
      episode: String(params.episode),
      lang: params.lang || 'sub',
      autoPlay: params.autoPlay ? '1' : '0',
      start: String(params.start || 0),
    });
    if (params.provider) qs.set('provider', params.provider);

    return apiFetch<ResolvedStreamResponse>(`/api/streaming/resolve?${qs.toString()}`, {
      signal,
      timeoutMs: API_TIMEOUTS.STREAM_MS,
    });
  },

  async reportTelemetry(payload: {
    event: 'init_success' | 'failover' | 'error';
    server?: string;
    from?: string;
    to?: string;
    reason?: string;
    anilistId?: number;
    episode?: number;
    latencyMs?: number;
  }): Promise<void> {
    try {
      await apiFetch('/api/streaming/telemetry', {
        method: 'POST',
        body: JSON.stringify(payload),
        timeoutMs: API_TIMEOUTS.CATALOG_MS,
      });
    } catch {
      // Best-effort telemetry
    }
  },

  async reportError(providerKey: string, error: string): Promise<void> {
    try {
      await apiFetch('/api/streaming/report-error', {
        method: 'POST',
        body: JSON.stringify({ providerKey, error }),
        timeoutMs: API_TIMEOUTS.CATALOG_MS,
      });
    } catch {
      // Best-effort reporting
    }
  },
};

