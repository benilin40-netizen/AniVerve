import type { ProviderAdapterType, StreamingProvider } from '../../types/anime.ts';
import { AniEmbedAdapter } from './AniEmbedAdapter.ts';
import {
  BaseProviderAdapter,
  validateProviderBaseUrl,
  validateProviderUrlTemplate,
  validateStrictHttpsUrl,
} from './BaseProviderAdapter.ts';
import { YenimeAdapter } from './YenimeAdapter.ts';

export {
  AniEmbedAdapter,
  BaseProviderAdapter,
  YenimeAdapter,
  validateProviderBaseUrl,
  validateProviderUrlTemplate,
  validateStrictHttpsUrl,
};

export const CORE_PROVIDER_KEYS: readonly ProviderAdapterType[] = [
  'yenime',
  'aniembed',
];

export function resolveAdapterType(key: string, explicitType?: ProviderAdapterType): ProviderAdapterType {
  if (
    explicitType === 'yenime' ||
    explicitType === 'aniembed'
  ) {
    return explicitType;
  }
  const normalized = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized === 'aniembed') return 'aniembed';
  return 'yenime';
}

export function createProviderAdapter(config: StreamingProvider): BaseProviderAdapter {
  const type = resolveAdapterType(config.key, config.adapterType);
  if (type === 'aniembed') {
    return new AniEmbedAdapter(config);
  }
  return new YenimeAdapter(config);
}
