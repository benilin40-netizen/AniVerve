import type { StreamingProvider } from '../types/anime.ts';
import { createProviderAdapter } from './adapters/index.ts';
import type { PlaybackProvider } from './types.ts';

export function buildPlaybackProviders(backendProviders: StreamingProvider[]): PlaybackProvider[] {
  return (backendProviders || [])
    .filter((p) => p.key === 'yenime' || p.key === 'aniembed')
    .map((p) => createProviderAdapter(p))
    .filter((adapter) => adapter.isActivated())
    .sort((a, b) => a.priority - b.priority);
}
