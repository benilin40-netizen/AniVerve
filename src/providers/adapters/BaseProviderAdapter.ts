import type {
  ProviderAdapterType,
  ProviderAvailabilityStatus,
  StreamingProvider,
  SupportedIdType,
} from '../../types/anime.ts';
import type {
  PlaybackBuildParams,
  PlaybackProvider,
  PlaybackTrack,
  PlaybackValidationResult,
} from '../types.ts';

export interface StrictUrlValidationResult {
  valid: boolean;
  normalized: string;
  parsed?: URL;
  stage?: 'url_syntax' | 'hostname';
  error?: string;
}

export function cleanProviderValue(raw?: string | null): string {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

export function validateStrictHttpsUrl(
  value: unknown,
  options?: { expectedHostname?: string; label?: string }
): StrictUrlValidationResult {
  const label = options?.label || 'URL';
  if (value === null || value === undefined || typeof value !== 'string') {
    return {
      valid: false,
      normalized: '',
      stage: 'url_syntax',
      error: `${label} is missing or invalid (must be an HTTPS URL string).`,
    };
  }

  const normalized = value.trim();
  if (!normalized) {
    return {
      valid: false,
      normalized: '',
      stage: 'url_syntax',
      error: `${label} is not configured.`,
    };
  }

  if (
    normalized.startsWith('"') ||
    normalized.endsWith('"') ||
    normalized.startsWith("'") ||
    normalized.endsWith("'") ||
    /["'`]/.test(normalized)
  ) {
    return {
      valid: false,
      normalized,
      stage: 'url_syntax',
      error: `${label} must not contain surrounding or embedded quotation marks.`,
    };
  }

  if (/\s/.test(normalized)) {
    return {
      valid: false,
      normalized,
      stage: 'url_syntax',
      error: `${label} must not contain whitespace.`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return {
      valid: false,
      normalized,
      stage: 'url_syntax',
      error: `${label} does not parse as a valid URL.`,
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      normalized,
      stage: 'url_syntax',
      error: `${label} must use the https:// protocol.`,
    };
  }

  if (!parsed.hostname) {
    return {
      valid: false,
      normalized,
      stage: 'hostname',
      error: `${label} is missing a valid hostname.`,
    };
  }

  if (options?.expectedHostname && parsed.hostname !== options.expectedHostname) {
    return {
      valid: false,
      normalized,
      parsed,
      stage: 'hostname',
      error: `${label} hostname "${parsed.hostname}" is not allowed (expected ${options.expectedHostname}).`,
    };
  }

  return {
    valid: true,
    normalized,
    parsed,
  };
}

export function validateProviderBaseUrl(
  baseUrl: unknown,
  options: { requiredBaseHostname: string; providerName?: string }
): StrictUrlValidationResult {
  const prefix = options.providerName ? `${options.providerName} Base URL` : 'Provider Base URL';
  return validateStrictHttpsUrl(baseUrl, {
    expectedHostname: options.requiredBaseHostname,
    label: prefix,
  });
}

export function validateProviderUrlTemplate(
  template: unknown,
  options: {
    requiredHostname: string;
    requiredPlaceholders: string[];
    forbiddenPlaceholders?: string[];
    baseUrl?: unknown;
    requiredBaseHostname?: string;
    providerName?: string;
  }
): { valid: boolean; stage?: 'url_syntax' | 'hostname'; error?: string } {
  const name = options.providerName || 'Provider';

  if (options.baseUrl !== undefined && options.requiredBaseHostname) {
    const baseCheck = validateProviderBaseUrl(options.baseUrl, {
      requiredBaseHostname: options.requiredBaseHostname,
      providerName: name,
    });
    if (!baseCheck.valid) {
      return {
        valid: false,
        stage: baseCheck.stage || 'url_syntax',
        error: baseCheck.error,
      };
    }
  }

  if (template === null || template === undefined || typeof template !== 'string') {
    return {
      valid: false,
      stage: 'url_syntax',
      error: `${name} player URL template is missing.`,
    };
  }

  const trimmed = template.trim();
  if (!trimmed) {
    return {
      valid: false,
      stage: 'url_syntax',
      error: `${name} player URL template is not configured.`,
    };
  }

  if (
    trimmed.startsWith('"') ||
    trimmed.endsWith('"') ||
    trimmed.startsWith("'") ||
    trimmed.endsWith("'") ||
    /["'`<>]/.test(trimmed)
  ) {
    return {
      valid: false,
      stage: 'url_syntax',
      error: `${name} player URL template must not contain quotation marks or angle brackets.`,
    };
  }

  if (/\s/.test(trimmed)) {
    return {
      valid: false,
      stage: 'url_syntax',
      error: `${name} player URL template must not contain whitespace.`,
    };
  }

  for (const ph of options.requiredPlaceholders) {
    if (!trimmed.includes(ph)) {
      return {
        valid: false,
        stage: 'url_syntax',
        error: `${name} player URL template must include required placeholder ${ph}.`,
      };
    }
  }

  if (options.forbiddenPlaceholders) {
    for (const forbidden of options.forbiddenPlaceholders) {
      if (trimmed.includes(forbidden)) {
        return {
          valid: false,
          stage: 'url_syntax',
          error: `${name} player URL template must not contain unsupported placeholder ${forbidden}.`,
        };
      }
    }
  }

  const sample = trimmed
    .replaceAll('{ANILIST_ID}', '16498')
    .replaceAll('{EPISODE}', '1')
    .replaceAll('{LANG}', 'sub')
    .replaceAll('{AUTOPLAY}', '0')
    .replaceAll('{START}', '0')
    .replaceAll('{SLUG}', 'attack-on-titan')
    .replaceAll('{UID}', 'sampleuid')
    .replaceAll('{ORIGIN}', 'sampleorigin');

  if (/\{[A-Z0-9_]+\}/.test(sample)) {
    return {
      valid: false,
      stage: 'url_syntax',
      error: `${name} player URL template contains unsupported placeholders.`,
    };
  }

  const urlCheck = validateStrictHttpsUrl(sample, {
    expectedHostname: options.requiredHostname,
    label: `${name} Player URL Template`,
  });

  if (!urlCheck.valid) {
    return {
      valid: false,
      stage: urlCheck.stage || 'url_syntax',
      error: urlCheck.error,
    };
  }

  return { valid: true };
}

export abstract class BaseProviderAdapter implements PlaybackProvider {
  readonly key: string;
  readonly name: string;
  abstract readonly adapterType: ProviderAdapterType;
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
  protected readonly urlTemplate: string;
  protected readonly baseUrl: string;

  constructor(config: Partial<StreamingProvider> & { key: string; name: string }) {
    this.key = config.key;
    this.name = config.name;
    this.baseUrl = cleanProviderValue(config.baseUrl);
    this.urlTemplate = cleanProviderValue(config.urlTemplate);

    const tracks = (config.supportedLanguages || ['sub', 'dub']).filter(
      (lang): lang is PlaybackTrack => lang === 'sub' || lang === 'dub'
    );
    this.supportedTracks = tracks.length > 0 ? tracks : ['sub', 'dub'];

    this.supportedIdTypes = ['anilist'];
    this.supportsResume = this.urlTemplate.includes('{START}');
    this.supportsAutoPlay = this.urlTemplate.includes('{AUTOPLAY}');
    this.isEnabled = Boolean(config.isEnabled);
    this.licenseVerified = Boolean(config.licenseVerified);
    this.embeddingAllowed =
      config.embeddingAllowed !== undefined ? config.embeddingAllowed : null;
    this.availabilityStatus =
      config.availabilityStatus ||
      (!this.urlTemplate
        ? 'unconfigured'
        : !this.licenseVerified
          ? 'unverified'
          : 'available');
    this.priority = Number.isFinite(config.priority) ? Number(config.priority) : 10;
    this.errorCount = Number.isFinite(config.errorCount) ? Number(config.errorCount) : 0;
    this.lastError = config.lastError ?? null;
  }

  supportsTrack(track: PlaybackTrack): boolean {
    return this.supportedTracks.includes(track);
  }

  supportsIdType(idType: SupportedIdType): boolean {
    return this.supportedIdTypes.includes(idType);
  }

  isActivated(): boolean {
    return (
      this.isEnabled &&
      this.licenseVerified &&
      this.embeddingAllowed !== false &&
      Boolean(this.urlTemplate) &&
      this.validateConfiguration().valid
    );
  }

  abstract validateConfiguration(): { valid: boolean; stage?: 'url_syntax' | 'hostname'; error?: string };

  protected checkActivationGate(): string | null {
    if (!this.isEnabled) {
      return `${this.name} is currently disabled by an administrator.`;
    }
    if (!this.licenseVerified) {
      return `${this.name} cannot be activated until distribution and embedding permissions are verified.`;
    }
    if (this.embeddingAllowed === false) {
      return `${this.name} prohibits cross-origin iframe embedding (blocked by upstream framing policy).`;
    }
    if (!this.urlTemplate) {
      return `${this.name} is not configured with an authorized embed endpoint.`;
    }
    return null;
  }

  protected checkParamsAndIds(params: PlaybackBuildParams): PlaybackValidationResult | null {
    if (!Number.isInteger(params.episode) || params.episode <= 0) {
      return { valid: false, url: null, error: 'Valid positive episode number is required.' };
    }
    if (!Number.isInteger(params.anilistId) || params.anilistId <= 0) {
      return {
        valid: false,
        url: null,
        missingIdType: 'anilist',
        error: `${this.name} requires a valid positive AniList ID.`,
      };
    }
    if (params.track !== 'sub' && params.track !== 'dub') {
      return {
        valid: false,
        url: null,
        error: 'Audio track must be either sub or dub.',
      };
    }
    if (!this.supportsTrack(params.track)) {
      return {
        valid: false,
        url: null,
        unsupportedTrack: params.track,
        error: `${this.name} does not support ${params.track === 'dub' ? 'Dubbed' : 'Subtitled'} audio.`,
      };
    }
    return null;
  }

  abstract buildEmbedUrl(params: PlaybackBuildParams): PlaybackValidationResult;
}
