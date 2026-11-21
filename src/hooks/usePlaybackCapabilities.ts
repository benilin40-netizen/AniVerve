import { useEffect, useState } from 'react';
import { streamingService } from '../services/streamingService.ts';

let cachedTracks: Array<'sub' | 'dub'> | null = null;
let inflightPromise: Promise<Array<'sub' | 'dub'>> | null = null;

async function fetchConfirmedTracks(): Promise<Array<'sub' | 'dub'>> {
  if (cachedTracks) return cachedTracks;
  if (!inflightPromise) {
    inflightPromise = streamingService
      .getProviderRegistry()
      .then((res) => {
        const tracks = new Set<'sub' | 'dub'>();
        for (const p of res.providers) {
          if (p.isEnabled && p.licenseVerified && p.embeddingAllowed !== false) {
            for (const lang of p.supportedLanguages || []) {
              const norm = lang.toLowerCase();
              if (norm === 'sub' || norm === 'dub') tracks.add(norm);
            }
          }
        }
        cachedTracks = Array.from(tracks);
        return cachedTracks;
      })
      .catch(() => [])
      .finally(() => {
        inflightPromise = null;
      });
  }
  return inflightPromise;
}

export function usePlaybackCapabilities(): Array<'sub' | 'dub'> {
  const [tracks, setTracks] = useState<Array<'sub' | 'dub'>>(cachedTracks || []);

  useEffect(() => {
    let active = true;
    void fetchConfirmedTracks().then((list) => {
      if (active) setTracks(list);
    });
    return () => {
      active = false;
    };
  }, []);

  return tracks;
}
