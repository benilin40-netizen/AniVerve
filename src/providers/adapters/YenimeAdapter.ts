import type { ProviderAdapterType, StreamingProvider } from '../../types/anime.ts';
import type { PlaybackBuildParams, PlaybackValidationResult } from '../types.ts';
import {
  BaseProviderAdapter,
  validateProviderUrlTemplate,
  validateStrictHttpsUrl,
} from './BaseProviderAdapter.ts';

export const YENIME_DEFAULT_API_BASE = 'https://api.yenime.net';
export const YENIME_DEFAULT_TEMPLATE = 'https://player.yenime.net/anime/ani/{ANILIST_ID}/{EPISODE}';

export class YenimeAdapter extends BaseProviderAdapter {
  readonly adapterType: ProviderAdapterType = 'yenime';

  constructor(config?: Partial<StreamingProvider>) {
    super({
      key: 'yenime',
      name: config?.name || 'Yenime',
      baseUrl: config?.baseUrl !== undefined ? config.baseUrl : YENIME_DEFAULT_API_BASE,
      urlTemplate: config?.urlTemplate !== undefined ? config.urlTemplate : YENIME_DEFAULT_TEMPLATE,
      supportedIdTypes: ['anilist'],
      supportedLanguages: config?.supportedLanguages || ['sub', 'dub'],
      isEnabled: config?.isEnabled ?? false,
      licenseVerified: config?.licenseVerified ?? false,
      embeddingAllowed: config?.embeddingAllowed ?? null,
      availabilityStatus: config?.availabilityStatus || 'unverified',
      priority: config?.priority ?? 1,
      errorCount: config?.errorCount ?? 0,
      lastError: config?.lastError ?? null,
    });
  }

  override validateConfiguration(): { valid: boolean; stage?: 'url_syntax' | 'hostname'; error?: string } {
    return validateProviderUrlTemplate(this.urlTemplate, {
      providerName: this.name || 'Yenime',
      requiredHostname: 'player.yenime.net',
      requiredPlaceholders: ['{ANILIST_ID}', '{EPISODE}'],
      forbiddenPlaceholders: ['{LANG}', '{AUTOPLAY}', '{START}'],
      baseUrl: this.baseUrl,
      requiredBaseHostname: 'api.yenime.net',
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

    const resolved = this.urlTemplate
      .replaceAll('{ANILIST_ID}', encodeURIComponent(String(params.anilistId)))
      .replaceAll('{EPISODE}', encodeURIComponent(String(params.episode)));

    if (/\{[A-Z0-9_]+\}/.test(resolved)) {
      return {
        valid: false,
        url: null,
        error: 'Yenime URL template contains unsupported placeholders.',
      };
    }

    const urlCheck = validateStrictHttpsUrl(resolved, {
      expectedHostname: 'player.yenime.net',
      label: 'Yenime Player URL',
    });
    if (!urlCheck.valid || !urlCheck.parsed) {
      return {
        valid: false,
        url: null,
        error: urlCheck.error || 'Yenime generated an invalid embed URL.',
      };
    }

    return { valid: true, url: urlCheck.parsed.toString() };
  }
}
