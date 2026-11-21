import type { ProviderAdapterType, StreamingProvider } from '../../types/anime.ts';
import type { PlaybackBuildParams, PlaybackValidationResult } from '../types.ts';
import {
  BaseProviderAdapter,
  validateProviderUrlTemplate,
  validateStrictHttpsUrl,
} from './BaseProviderAdapter.ts';

export const ANIEMBED_DEFAULT_BASE = 'https://aniembed.se/e';
export const ANIEMBED_DEFAULT_TEMPLATE =
  'https://aniembed.se/e/{ANILIST_ID}/{EPISODE}?lang={LANG}&autoplay={AUTOPLAY}&t={START}';

export class AniEmbedAdapter extends BaseProviderAdapter {
  readonly adapterType: ProviderAdapterType = 'aniembed';

  constructor(config?: Partial<StreamingProvider>) {
    super({
      key: 'aniembed',
      name: config?.name || 'AniEmbed',
      baseUrl: config?.baseUrl !== undefined ? config.baseUrl : ANIEMBED_DEFAULT_BASE,
      urlTemplate: config?.urlTemplate !== undefined ? config.urlTemplate : ANIEMBED_DEFAULT_TEMPLATE,
      supportedIdTypes: ['anilist'],
      supportedLanguages: config?.supportedLanguages || ['sub', 'dub'],
      isEnabled: config?.isEnabled ?? false,
      licenseVerified: config?.licenseVerified ?? false,
      embeddingAllowed: config?.embeddingAllowed ?? null,
      availabilityStatus: config?.availabilityStatus || 'unverified',
      priority: config?.priority ?? 2,
      errorCount: config?.errorCount ?? 0,
      lastError: config?.lastError ?? null,
    });
  }

  override validateConfiguration(): { valid: boolean; stage?: 'url_syntax' | 'hostname'; error?: string } {
    return validateProviderUrlTemplate(this.urlTemplate, {
      providerName: this.name || 'AniEmbed',
      requiredHostname: 'aniembed.se',
      requiredPlaceholders: ['{ANILIST_ID}', '{EPISODE}', '{LANG}', '{AUTOPLAY}', '{START}'],
      baseUrl: this.baseUrl,
      requiredBaseHostname: 'aniembed.se',
    });
  }

  override buildEmbedUrl(params: PlaybackBuildParams): PlaybackValidationResult {
    const gateError = this.checkActivationGate();
    if (gateError) {
      return { valid: false, url: null, error: gateError };
    }

    const configCheck = this.validateConfiguration();
    if (!configCheck.valid) {
      return { valid: false, url: null, error: configCheck.error };
    }

    const paramError = this.checkParamsAndIds(params);
    if (paramError) {
      return paramError;
    }

    const startSeconds =
      Number.isFinite(params.startSeconds) && params.startSeconds > 0
        ? Math.floor(params.startSeconds)
        : 0;
    const autoPlayFlag = params.autoPlay ? '1' : '0';

    const resolved = this.urlTemplate
      .replaceAll('{ANILIST_ID}', encodeURIComponent(String(params.anilistId)))
      .replaceAll('{EPISODE}', encodeURIComponent(String(params.episode)))
      .replaceAll('{LANG}', encodeURIComponent(params.track))
      .replaceAll('{AUTOPLAY}', encodeURIComponent(autoPlayFlag))
      .replaceAll('{START}', encodeURIComponent(String(startSeconds)));

    if (/\{[A-Z0-9_]+\}/.test(resolved)) {
      return {
        valid: false,
        url: null,
        error: 'AniEmbed URL template contains unsupported placeholders.',
      };
    }

    const urlCheck = validateStrictHttpsUrl(resolved, {
      expectedHostname: 'aniembed.se',
      label: 'AniEmbed Player URL',
    });
    if (!urlCheck.valid || !urlCheck.parsed) {
      return {
        valid: false,
        url: null,
        error: urlCheck.error || 'AniEmbed generated an invalid embed URL.',
      };
    }

    return { valid: true, url: urlCheck.parsed.toString() };
  }
}
