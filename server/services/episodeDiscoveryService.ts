import type {
  AnimeDetail,
  DiagnosticAttempt,
  DiagnosticReport,
  DiscoveredEpisode,
  EpisodeDiscoveryResult,
  EpisodeSourcesResponse,
  ProviderEpisodeProbeStatus,
  ResolvedEpisodeSource,
  StreamingProvider,
} from '../../src/types/anime.ts';
import {
  buildProviderEmbedUrl,
  getProviders,
  recordPlaybackSuccess,
  recordProviderError,
} from '../providers/providerRegistry.ts';
import { getAnimeDetails, resolveAnimeIds } from './anilistService.ts';
import { getCached, getStaleFallback, setCached } from './cacheService.ts';
import {
  BROWSER_USER_AGENT,
  dedupeInFlight,
  HttpRequestError,
  reliableFetch,
  TIMEOUTS,
} from '../utils/httpClient.ts';
import { probeDirectMediaStream } from '../../src/utils/hlsAudio.ts';

interface YenimeEpisodeRaw {
  id?: number | string;
  number?: number | string;
  title?: string | null;
  isFiller?: boolean;
  hasSub?: boolean;
  hasDub?: boolean;
  sub?: boolean;
  dub?: boolean;
  servers?: string | null;
}

interface YenimeAnimeResponse {
  mal?: {
    malId?: number;
    title?: string;
    episodes?: number;
    episodeCount?: number;
  } | null;
  anikoto?: {
    id?: string;
    slug?: string;
    title?: string;
    malId?: number | null;
  } | null;
  episodes?: YenimeEpisodeRaw[];
  episode?: {
    id?: number | string;
    number?: number | string;
    title?: string | null;
    hasSub?: boolean;
    hasDub?: boolean;
  } | null;
  sources?: Array<{
    file?: string;
    url?: string;
    type?: string;
  }>;
  embed?: string;
}

interface YenimeMegaplayResponse {
  m3u8?: string;
  proxiedUrl?: string;
  embedUrl?: string;
  title?: string;
  server?: string;
  tracks?: Array<{ file: string; label?: string; kind?: string }>;
  error?: string;
}

function normalizeTitleForMatch(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titlesRoughlyMatch(anime: AnimeDetail, candidateTitle?: string | null): boolean {
  if (!candidateTitle) return false;
  const normCandidate = normalizeTitleForMatch(candidateTitle);
  if (!normCandidate) return false;

  const knownTitles = [
    anime.title?.romaji,
    anime.title?.english,
    anime.title?.userPreferred,
  ]
    .filter((t): t is string => Boolean(t && t.trim()))
    .map(normalizeTitleForMatch);

  return knownTitles.some(
    (t) =>
      t === normCandidate ||
      (t.length >= 6 && normCandidate.includes(t)) ||
      (normCandidate.length >= 6 && t.includes(normCandidate))
  );
}

function parseEpisodeNumber(raw: number | string | undefined | null): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  if (typeof raw === 'string') {
    const cleaned = raw.trim();
    const num = Number(cleaned);
    if (Number.isFinite(num) && num >= 0) return num;
    const match = cleaned.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }
  return null;
}

function formatEpisodeLabel(num: number): string {
  if (Number.isInteger(num)) return String(num);
  return String(num);
}

function isSpecialEpisode(num: number, title?: string | null): boolean {
  if (!Number.isInteger(num) || num === 0) return true;
  if (title && /\b(ova|oad|special|recap|sp|prologue|epilogue|extra)\b/i.test(title)) {
    return true;
  }
  return false;
}

function getKnownAiredCeiling(anime: AnimeDetail): number | null {
  if (anime.status === 'NOT_YET_RELEASED') return 0;
  if (anime.episodes && anime.episodes > 0 && anime.status === 'FINISHED') {
    return anime.episodes;
  }
  if (anime.nextAiringEpisode?.episode && anime.nextAiringEpisode.episode > 1) {
    return anime.nextAiringEpisode.episode - 1;
  }
  if (anime.episodes && anime.episodes > 0) {
    return anime.episodes;
  }
  if (anime.streamingEpisodes && anime.streamingEpisodes.length > 0) {
    return anime.streamingEpisodes.length;
  }
  if (anime.status === 'RELEASING' || anime.format === 'MOVIE') {
    return 1;
  }
  return null;
}

async function discoverYenimeEpisodes(
  anime: AnimeDetail,
  provider: StreamingProvider,
  signal?: AbortSignal
): Promise<{
  status: ProviderEpisodeProbeStatus;
  episodes: Array<{
    episodeNumber: number;
    title: string | null;
    isSpecial: boolean;
    hasSub: boolean;
    hasDub: boolean;
    episodeId?: number | string;
    malId?: number | null;
    anikotoId?: string | null;
    serversToken?: string | null;
  }>;
}> {
  const startedAt = Date.now();
  const baseUrl = (provider.baseUrl || 'https://api.yenime.net').replace(/\/$/, '');

  if (!provider.isEnabled) {
    return {
      status: {
        providerKey: 'yenime',
        providerName: provider.name,
        status: 'disabled',
        episodeCount: 0,
        latencyMs: 0,
        error: 'Provider is currently disabled.',
      },
      episodes: [],
    };
  }

  try {
    let resolvedPayload: YenimeAnimeResponse | null = null;
    let matchedMalId: number | null = anime.idMal ?? null;

    if (anime.idMal && anime.idMal > 0) {
      const res = await reliableFetch(`${baseUrl}/anime?mal=${anime.idMal}&ep=1`, {
        method: 'GET',
        timeoutMs: TIMEOUTS.EPISODE_DISCOVERY_MS,
        maxAttempts: 2,
        externalSignal: signal,
        headers: { Accept: 'application/json', 'User-Agent': BROWSER_USER_AGENT },
      });

      if (res.ok) {
        const json = (await res.json().catch(() => null)) as YenimeAnimeResponse | null;
        // CRITICAL: api.yenime.net falls back to an unrelated "anikoto" record if MAL ID isn't mapped.
        // Only accept the response if json.mal.malId matches anime.idMal OR the returned title matches.
        if (
          json &&
          Array.isArray(json.episodes) &&
          json.episodes.length > 0 &&
          (json.mal?.malId === anime.idMal ||
            titlesRoughlyMatch(anime, json.mal?.title || json.anikoto?.title))
        ) {
          resolvedPayload = json;
        }
      }
    }

    // Fallback search by title when MAL ID is missing or Yenime had no direct MAL mapping
    if (!resolvedPayload) {
      const searchTitle = anime.title.romaji || anime.title.english;
      if (searchTitle) {
        const searchRes = await reliableFetch(
          `${baseUrl}/search?q=${encodeURIComponent(searchTitle)}`,
          {
            method: 'GET',
            timeoutMs: TIMEOUTS.EPISODE_DISCOVERY_MS,
            maxAttempts: 2,
            externalSignal: signal,
            headers: { Accept: 'application/json' },
          }
        ).catch(() => null);

        if (searchRes?.ok) {
          const searchJson = (await searchRes.json().catch(() => null)) as
            | { results?: Array<{ id?: string; title?: string; malId?: number | null }>; data?: Array<{ id?: string; title?: string; malId?: number | null }> }
            | Array<{ id?: string; title?: string; malId?: number | null }>
            | null;
          const candidates = Array.isArray(searchJson)
            ? searchJson
            : searchJson?.results || searchJson?.data || [];
          const best = candidates.find(
            (c) =>
              (anime.idMal && c.malId === anime.idMal) ||
              titlesRoughlyMatch(anime, c.title)
          );

          if (best?.id) {
            const epRes = await reliableFetch(
              `${baseUrl}/episodes?id=${encodeURIComponent(best.id)}`,
              {
                method: 'GET',
                timeoutMs: TIMEOUTS.EPISODE_DISCOVERY_MS,
                maxAttempts: 2,
                externalSignal: signal,
                headers: { Accept: 'application/json' },
              }
            ).catch(() => null);

            if (epRes?.ok) {
              const epJson = (await epRes.json().catch(() => null)) as
                | YenimeAnimeResponse
                | YenimeEpisodeRaw[]
                | null;
              if (Array.isArray(epJson) && epJson.length > 0) {
                resolvedPayload = { episodes: epJson, anikoto: { id: best.id, title: best.title } };
                matchedMalId = best.malId ?? matchedMalId;
              } else if (epJson && !Array.isArray(epJson) && Array.isArray(epJson.episodes)) {
                resolvedPayload = epJson;
                matchedMalId = best.malId ?? matchedMalId;
              }
            }
          }
        }
      }
    }

    // Final single-episode verification by AniList ID if full list endpoint returned nothing
    if (!resolvedPayload || !Array.isArray(resolvedPayload.episodes) || resolvedPayload.episodes.length === 0) {
      if (anime.status !== 'NOT_YET_RELEASED') {
        const ep1Probe = await reliableFetch(
          `${baseUrl}/megaplay?ani=${anime.id}&ep=1&type=sub`,
          {
            method: 'GET',
            timeoutMs: TIMEOUTS.EPISODE_DISCOVERY_MS,
            maxAttempts: 1,
            externalSignal: signal,
            headers: { Accept: 'application/json', 'User-Agent': BROWSER_USER_AGENT },
          }
        ).catch(() => null);

        if (ep1Probe?.ok) {
          const probeJson = (await ep1Probe.json().catch(() => null)) as YenimeMegaplayResponse | null;
          if (probeJson && (probeJson.embedUrl || probeJson.m3u8)) {
            const latencyMs = Date.now() - startedAt;
            return {
              status: {
                providerKey: 'yenime',
                providerName: provider.name,
                status: 'partial',
                episodeCount: 1,
                latencyMs,
                error: null,
              },
              episodes: [
                {
                  episodeNumber: 1,
                  title: probeJson.title || null,
                  isSpecial: false,
                  hasSub: true,
                  hasDub: provider.supportedLanguages.includes('dub'),
                  malId: anime.idMal ?? null,
                },
              ],
            };
          }
        }
      }

      const latencyMs = Date.now() - startedAt;
      return {
        status: {
          providerKey: 'yenime',
          providerName: provider.name,
          status: anime.idMal ? 'ok' : 'no_id',
          episodeCount: 0,
          latencyMs,
          error: anime.idMal ? null : 'No MAL ID linked for Yenime full-list lookup.',
        },
        episodes: [],
      };
    }

    const mapped = resolvedPayload.episodes
      .map((ep) => {
        const num = parseEpisodeNumber(ep.number);
        if (num === null) return null;
        const hasSub = ep.hasSub !== undefined ? Boolean(ep.hasSub) : ep.sub !== undefined ? Boolean(ep.sub) : true;
        const hasDub = ep.hasDub !== undefined ? Boolean(ep.hasDub) : ep.dub !== undefined ? Boolean(ep.dub) : false;
        return {
          episodeNumber: num,
          title: ep.title ? String(ep.title).trim() : null,
          isSpecial: isSpecialEpisode(num, ep.title),
          hasSub,
          hasDub,
          episodeId: ep.id,
          malId: resolvedPayload?.mal?.malId ?? matchedMalId,
          anikotoId: resolvedPayload?.anikoto?.id ?? null,
          serversToken: ep.servers ?? null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const latencyMs = Date.now() - startedAt;
    return {
      status: {
        providerKey: 'yenime',
        providerName: provider.name,
        status: 'ok',
        episodeCount: mapped.length,
        latencyMs,
        error: null,
      },
      episodes: mapped,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const isTimeout = err instanceof HttpRequestError && err.timedOut;
    const message = err instanceof Error ? err.message : 'Yenime episode discovery failed';
    void recordProviderError('yenime', message, false);

    return {
      status: {
        providerKey: 'yenime',
        providerName: provider.name,
        status: isTimeout ? 'timeout' : 'error',
        episodeCount: 0,
        latencyMs,
        error: message,
      },
      episodes: [],
    };
  }
}

async function probeAniEmbedAnime(
  anime: AnimeDetail,
  provider: StreamingProvider,
  signal?: AbortSignal
): Promise<{
  status: ProviderEpisodeProbeStatus;
  verifiedReachable: boolean;
}> {
  const startedAt = Date.now();
  if (!provider.isEnabled) {
    return {
      status: {
        providerKey: 'aniembed',
        providerName: provider.name,
        status: 'disabled',
        episodeCount: 0,
        latencyMs: 0,
        error: 'Provider is currently disabled.',
      },
      verifiedReachable: false,
    };
  }

  if (anime.status === 'NOT_YET_RELEASED') {
    return {
      status: {
        providerKey: 'aniembed',
        providerName: provider.name,
        status: 'ok',
        episodeCount: 0,
        latencyMs: 0,
        error: null,
      },
      verifiedReachable: false,
    };
  }

  try {
    const url = buildProviderEmbedUrl(provider, {
      anilistId: anime.id,
      episode: 1,
      language: 'sub',
      autoPlay: false,
      startSec: 0,
    });

    const res = await reliableFetch(url, {
      method: 'GET',
      timeoutMs: TIMEOUTS.EPISODE_DISCOVERY_MS,
      maxAttempts: 2,
      externalSignal: signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'User-Agent': BROWSER_USER_AGENT,
      },
    });

    const html = await res.text().catch(() => '');
    const latencyMs = Date.now() - startedAt;
    const hasShell = res.status >= 200 && res.status < 400 && (html.includes('<html') || html.includes('<!doctype html'));
    const airedCount = getKnownAiredCeiling(anime) ?? 0;

    return {
      status: {
        providerKey: 'aniembed',
        providerName: provider.name,
        status: hasShell ? 'ok' : 'error',
        episodeCount: hasShell ? Math.max(airedCount, 1) : 0,
        latencyMs,
        error: hasShell ? null : `AniEmbed returned HTTP ${res.status}`,
      },
      verifiedReachable: hasShell,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const isTimeout = err instanceof HttpRequestError && err.timedOut;
    const message = err instanceof Error ? err.message : 'AniEmbed probe failed';
    void recordProviderError('aniembed', message, false);

    return {
      status: {
        providerKey: 'aniembed',
        providerName: provider.name,
        status: isTimeout ? 'timeout' : 'error',
        episodeCount: 0,
        latencyMs,
        error: message,
      },
      verifiedReachable: false,
    };
  }
}



export async function discoverAnimeEpisodes(
  anilistId: number,
  options?: { refresh?: boolean; signal?: AbortSignal }
): Promise<EpisodeDiscoveryResult> {
  const cacheKey = `anime:episodes:v2:${anilistId}`;
  if (!options?.refresh) {
    const cached = getCached<EpisodeDiscoveryResult>(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }
  }

  try {
    return await dedupeInFlight(
      `episodes:discover:${anilistId}:${options?.refresh ? 'refresh' : 'cached'}`,
      async () => {
        const [anime, allProviders] = await Promise.all([
          getAnimeDetails(anilistId),
          getProviders(true),
        ]);

        if (!anime) {
          throw new HttpRequestError(`Anime #${anilistId} not found on AniList.`, {
            status: 404,
          });
        }

        const primaryTitle =
          anime.title.english || anime.title.romaji || anime.title.userPreferred || `Anime #${anilistId}`;

        if (anime.status === 'NOT_YET_RELEASED') {
          const notReleased: EpisodeDiscoveryResult = {
            anilistId: anime.id,
            malId: anime.idMal ?? null,
            title: primaryTitle,
            catalogEpisodes: anime.episodes ?? null,
            discoveredCount: 0,
            discoveryStatus: 'complete',
            partialResults: false,
            providers: allProviders.map((p) => ({
              providerKey: p.key as 'yenime' | 'aniembed',
              providerName: p.name,
              status: p.isEnabled ? 'ok' : 'disabled',
              episodeCount: 0,
              latencyMs: 0,
              error: null,
            })),
            episodes: [],
            cached: false,
            fetchedAt: new Date().toISOString(),
            notice: `${primaryTitle} has not aired yet. Episodes will appear once broadcasting begins.`,
          };
          setCached(cacheKey, notReleased, 300);
          return notReleased;
        }

        const yenimeProvider = allProviders.find((p) => p.key === 'yenime');
        const aniEmbedProvider = allProviders.find((p) => p.key === 'aniembed');

        const [yenimeSettled, aniEmbedSettled] = await Promise.allSettled([
          yenimeProvider
            ? discoverYenimeEpisodes(anime, yenimeProvider, options?.signal)
            : Promise.resolve(null),
          aniEmbedProvider
            ? probeAniEmbedAnime(anime, aniEmbedProvider, options?.signal)
            : Promise.resolve(null),
        ]);

        const providerStatuses: ProviderEpisodeProbeStatus[] = [];
        const episodeMap = new Map<number, DiscoveredEpisode>();

        // 1. Merge Yenime discovered episodes (exact list including >24, >1000, specials, OVAs)
        const yenimeData =
          yenimeSettled.status === 'fulfilled' ? yenimeSettled.value : null;
        if (yenimeSettled.status === 'rejected' && yenimeProvider) {
          providerStatuses.push({
            providerKey: 'yenime',
            providerName: yenimeProvider.name,
            status: 'error',
            episodeCount: 0,
            latencyMs: 0,
            error:
              yenimeSettled.reason instanceof Error
                ? yenimeSettled.reason.message
                : 'Yenime discovery rejected',
          });
        } else if (yenimeData) {
          providerStatuses.push(yenimeData.status);
          for (const ep of yenimeData.episodes) {
            const existing = episodeMap.get(ep.episodeNumber);
            if (!existing) {
              episodeMap.set(ep.episodeNumber, {
                episodeNumber: ep.episodeNumber,
                numberLabel: formatEpisodeLabel(ep.episodeNumber),
                title: ep.title,
                isSpecial: ep.isSpecial,
                hasSub: ep.hasSub,
                hasDub: ep.hasDub,
                providers: ['yenime'],
                providerMappings: {
                  yenime: {
                    episodeId: ep.episodeId,
                    malId: ep.malId,
                    anilistId: anime.id,
                    anikotoId: ep.anikotoId,
                    serversToken: ep.serversToken,
                    hasSub: ep.hasSub,
                    hasDub: ep.hasDub,
                  },
                },
              });
            } else {
              if (!existing.providers.includes('yenime')) existing.providers.push('yenime');
              existing.hasSub = existing.hasSub || ep.hasSub;
              existing.hasDub = existing.hasDub || ep.hasDub;
              if (!existing.title && ep.title) existing.title = ep.title;
              existing.providerMappings.yenime = {
                episodeId: ep.episodeId,
                malId: ep.malId,
                anilistId: anime.id,
                anikotoId: ep.anikotoId,
                serversToken: ep.serversToken,
                hasSub: ep.hasSub,
                hasDub: ep.hasDub,
              };
            }
          }
        }



        // 3. Merge AniList/AniEmbed confirmed aired episode range without inventing episodes
        const aniEmbedData =
          aniEmbedSettled.status === 'fulfilled' ? aniEmbedSettled.value : null;
        if (aniEmbedSettled.status === 'rejected' && aniEmbedProvider) {
          providerStatuses.push({
            providerKey: 'aniembed',
            providerName: aniEmbedProvider.name,
            status: 'error',
            episodeCount: 0,
            latencyMs: 0,
            error:
              aniEmbedSettled.reason instanceof Error
                ? aniEmbedSettled.reason.message
                : 'AniEmbed probe rejected',
          });
        } else if (aniEmbedData) {
          providerStatuses.push(aniEmbedData.status);
        }

        const airedCeiling = getKnownAiredCeiling(anime);
        const aniEmbedReachable = Boolean(aniEmbedData?.verifiedReachable);

        const anilistConfirmedMax =
          airedCeiling && airedCeiling > 0
            ? airedCeiling
            : 0;

        if (aniEmbedReachable && anilistConfirmedMax > 0) {
          for (let epNum = 1; epNum <= anilistConfirmedMax; epNum++) {
            const streamingEpTitle = anime.streamingEpisodes?.[epNum - 1]?.title || null;
            const existing = episodeMap.get(epNum);
            if (!existing) {
              episodeMap.set(epNum, {
                episodeNumber: epNum,
                numberLabel: String(epNum),
                title: streamingEpTitle,
                isSpecial: false,
                hasSub: true,
                hasDub: aniEmbedProvider?.supportedLanguages.includes('dub') ?? true,
                providers: ['aniembed'],
                providerMappings: {
                  aniembed: {
                    anilistId: anime.id,
                    episode: epNum,
                    verified: true,
                    hasSub: true,
                    hasDub: aniEmbedProvider?.supportedLanguages.includes('dub') ?? true,
                  },
                },
              });
            } else {
              if (!existing.providers.includes('aniembed')) existing.providers.push('aniembed');
              if (!existing.title && streamingEpTitle) existing.title = streamingEpTitle;
              existing.providerMappings.aniembed = {
                anilistId: anime.id,
                episode: epNum,
                verified: true,
                hasSub: true,
                hasDub: aniEmbedProvider?.supportedLanguages.includes('dub') ?? true,
              };
            }
          }
        } else if (aniEmbedReachable) {
          for (const ep of episodeMap.values()) {
            if (Number.isInteger(ep.episodeNumber) && ep.episodeNumber >= 1) {
              if (!ep.providers.includes('aniembed')) ep.providers.push('aniembed');
              ep.providerMappings.aniembed = {
                anilistId: anime.id,
                episode: ep.episodeNumber,
                verified: true,
                hasSub: true,
                hasDub: aniEmbedProvider?.supportedLanguages.includes('dub') ?? true,
              };
            }
          }
        }

        const anyProviderFailed = providerStatuses.some(
          (s) => s.status === 'error' || s.status === 'timeout'
        );

        const episodes = Array.from(episodeMap.values()).sort(
          (a, b) => a.episodeNumber - b.episodeNumber
        );

        const maxIntegerEpisode = episodes.reduce(
          (max, e) => (Number.isInteger(e.episodeNumber) && e.episodeNumber > max ? e.episodeNumber : max),
          0
        );
        const reportedPartial =
          anyProviderFailed ||
          providerStatuses.some((s) => s.status === 'partial') ||
          (anime.episodes !== null &&
            anime.episodes !== undefined &&
            anime.status === 'FINISHED' &&
            maxIntegerEpisode > 0 &&
            maxIntegerEpisode < anime.episodes);

        const discoveryStatus: EpisodeDiscoveryResult['discoveryStatus'] =
          episodes.length === 0
            ? 'unavailable'
            : reportedPartial
              ? 'partial'
              : 'complete';

        const failedNames = providerStatuses
          .filter((s) => s.status === 'error' || s.status === 'timeout')
          .map((s) => `${s.providerName} (${s.status})`)
          .join(', ');

        const notice =
          episodes.length === 0
            ? anime.episodes
              ? `No playable episodes could be verified from active streaming providers yet (AniList lists ${anime.episodes} catalog episode${anime.episodes === 1 ? '' : 's'} as reference).`
              : 'No playable episodes could be verified from active streaming providers yet.'
            : failedNames
              ? `Partial results: ${failedNames} did not respond in time.`
              : null;

        const result: EpisodeDiscoveryResult = {
          anilistId: anime.id,
          malId: anime.idMal ?? null,
          title: primaryTitle,
          catalogEpisodes: anime.episodes ?? null,
          discoveredCount: episodes.length,
          discoveryStatus,
          partialResults: reportedPartial,
          providers: providerStatuses,
          episodes,
          cached: false,
          fetchedAt: new Date().toISOString(),
          notice,
        };

        // Cache complete results for 10 mins, partial results for 60s so they recover quickly
        setCached(cacheKey, result, discoveryStatus === 'complete' ? 600 : 60);
        return result;
      }
    );
  } catch (err) {
    const stale = getStaleFallback<EpisodeDiscoveryResult>(cacheKey);
    if (stale) {
      return {
        ...stale,
        cached: true,
        partialResults: true,
        discoveryStatus: 'partial',
        notice: 'Showing cached episode list while upstream services recover.',
      };
    }
    throw err;
  }
}

function sanitizeDiagnosticText(input: string): string {
  return input
    .replace(/([?&](?:token|secret|key|auth|signature|sig|apikey)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/(bearer\s+)[a-z0-9._-]+/gi, '$1[redacted]')
    .slice(0, 260);
}

function classifyErrorCategory(
  status?: number | null,
  message?: string
): DiagnosticAttempt['errorCategory'] {
  const lower = (message || '').toLowerCase();
  if (lower.includes('does not support') && lower.includes('audio')) return 'unsupported_audio';
  if (lower.includes('timeout') || lower.includes('timed out')) return 'timeout';
  if (lower.includes('x-frame-options') || lower.includes('restricted') || status === 403) return 'restricted';
  if (status === 429) return 'rate_limited';
  if (status === 404 || status === 400) return 'not_found';
  if (status && status >= 500) return 'upstream_error';
  if (lower.includes('non-https') || lower.includes('template') || lower.includes('config')) {
    return 'config_error';
  }
  return 'network_error';
}

export async function resolveEpisodeSources(
  anilistId: number,
  episodeNumber: number,
  options?: {
    lang?: 'sub' | 'dub';
    provider?: string;
    autoPlay?: boolean;
    startSec?: number;
    refresh?: boolean;
    signal?: AbortSignal;
  }
): Promise<EpisodeSourcesResponse> {
  const lang = options?.lang === 'dub' ? 'dub' : 'sub';
  const requestedProvider = options?.provider?.trim().toLowerCase() || '';
  const autoPlay = Boolean(options?.autoPlay);
  const startSec = Math.max(0, Math.floor(options?.startSec || 0));
  const forceRefresh = Boolean(options?.refresh);

  return dedupeInFlight(
    `sources:resolve:${anilistId}:${episodeNumber}:${lang}:${requestedProvider}:${autoPlay ? 1 : 0}:${startSec}:${forceRefresh ? 'r' : 's'}`,
    async () => {
      const [anime, activeProviders, allProviders] = await Promise.all([
        getAnimeDetails(anilistId).catch(() => null),
        getProviders(false),
        getProviders(true),
      ]);

      const resolvedMapping =
        anime?.idMal !== undefined ? null : await resolveAnimeIds({ anilistId }).catch(() => null);
      const malId = anime?.idMal ?? resolvedMapping?.malId ?? null;
      const animeTitle =
        anime?.title?.english || anime?.title?.romaji || anime?.title?.userPreferred || null;
      const errors: EpisodeSourcesResponse['errors'] = [];
      const diagnosticAttempts: DiagnosticAttempt[] = [];

      if (anime?.status === 'NOT_YET_RELEASED') {
        const msg = 'This anime has not aired yet. Episode is unavailable.';
        const diagnostics: DiagnosticReport = {
          animeTitle,
          anilistId,
          malId,
          episodeNumber,
          audioTrack: lang,
          requestedProvider: requestedProvider || null,
          attemptedProviders: [
            {
              providerKey: 'catalog',
              providerName: 'AniList Catalog',
              stage: 'api_discovery',
              httpStatus: 404,
              errorCategory: 'not_found',
              message: msg,
              latencyMs: 0,
            },
          ],
          alternateAvailable: false,
          suggestedAction: 'Check the Airing Schedule page for the confirmed premiere date.',
          generatedAt: new Date().toISOString(),
        };
        return {
          anilistId,
          malId,
          episodeNumber,
          audioTrack: lang,
          sources: [],
          preferredSource: null,
          errors: [
            {
              providerKey: 'catalog',
              providerName: 'AniList Catalog',
              message: msg,
              status: 404,
            },
          ],
          allFailed: true,
          diagnostics,
          fetchedAt: new Date().toISOString(),
        };
      }

      for (const p of allProviders) {
        if (!p.isEnabled) {
          diagnosticAttempts.push({
            providerKey: p.key,
            providerName: p.name,
            stage: 'configuration',
            httpStatus: null,
            errorCategory: 'disabled',
            message: `${p.name} is currently disabled by administrator settings.`,
            latencyMs: 0,
          });
        }
      }

      // Build candidate provider list: honor requested provider first if valid, otherwise healthy sorted providers;
      // if all healthy providers are temporarily in cooldown, fall back to enabled providers for a recovery check.
      let candidates = [...activeProviders];
      if (candidates.length === 0) {
        candidates = allProviders.filter((p) => p.isEnabled);
      }
      if (requestedProvider) {
        const idx = candidates.findIndex((p) => p.key === requestedProvider);
        if (idx > 0) {
          const [picked] = candidates.splice(idx, 1);
          candidates.unshift(picked);
        } else if (idx === -1) {
          const fromAll = allProviders.find((p) => p.key === requestedProvider && p.isEnabled);
          if (fromAll) candidates.unshift(fromAll);
        }
      }

      const settled = await Promise.allSettled(
        candidates.map(async (provider): Promise<ResolvedEpisodeSource> => {
          const startedAt = Date.now();
          if (!provider.supportedLanguages.includes(lang)) {
            throw new HttpRequestError(
              `${provider.name} does not support ${lang.toUpperCase()} audio.`,
              { status: 422, retryable: false }
            );
          }

          if (provider.key === 'yenime') {
            const baseUrl = (provider.baseUrl || 'https://api.yenime.net').replace(/\/$/, '');
            const idQueries = malId ? [`mal=${malId}`, `ani=${anilistId}`] : [`ani=${anilistId}`];

            let payload: YenimeMegaplayResponse | null = null;
            let lastStatus = 0;

            for (const idQuery of idQueries) {
              const megaUrl = `${baseUrl}/megaplay?${idQuery}&ep=${episodeNumber}&type=${lang}`;
              const res = await reliableFetch(megaUrl, {
                method: 'GET',
                timeoutMs: TIMEOUTS.STREAM_RESOLUTION_MS,
                maxAttempts: 2,
                externalSignal: options?.signal,
                headers: {
                  Accept: 'application/json',
                  'User-Agent': BROWSER_USER_AGENT,
                },
              });
              lastStatus = res.status;

              if (res.ok) {
                const candidate = (await res.json().catch(() => null)) as YenimeMegaplayResponse | null;
                if (
                  candidate &&
                  !candidate.error &&
                  (candidate.m3u8 || candidate.embedUrl)
                ) {
                  payload = candidate;
                  break;
                }
              } else {
                try {
                  await res.body?.cancel();
                } catch {
                  // ignore
                }
                if (res.status !== 404 && res.status !== 400 && idQueries.length === 1) {
                  break;
                }
              }
            }

            if (!payload) {
              if (lastStatus === 404 || lastStatus === 400 || lastStatus === 200) {
                throw new HttpRequestError(
                  `Episode ${episodeNumber} (${lang.toUpperCase()}) unavailable on Yenime.`,
                  { status: lastStatus === 200 ? 404 : lastStatus, retryable: false }
                );
              }
              throw new HttpRequestError(
                `Yenime stream check returned HTTP ${lastStatus || 502}.`,
                { status: lastStatus || 502, retryable: true }
              );
            }

            const embedUrl = buildProviderEmbedUrl(provider, {
              anilistId,
              malId,
              episode: episodeNumber,
              language: lang,
              autoPlay,
              startSec,
            });

            const parsedEmbed = new URL(embedUrl);
            if (parsedEmbed.protocol !== 'https:') {
              throw new Error('Yenime resolved non-HTTPS player URL.');
            }

            let directPlayable = false;
            let directStreamHasAudio: 'yes' | 'no' | 'unknown' = 'unknown';

            // Probe only the direct unproxied manifest URL without evading upstream Referer checks.
            // Browsers can play direct HLS natively only when accessible over CORS with valid audio.
            const candidateDirectUrl = payload.m3u8 || null;
            if (candidateDirectUrl) {
              const directProbe = await probeDirectMediaStream(
                candidateDirectUrl,
                options?.signal,
                { userAgent: BROWSER_USER_AGENT }
              );
              if (directProbe.accessible) {
                directStreamHasAudio = directProbe.hasAudio;
                if (directProbe.corsAccessible && directProbe.hasAudio !== 'no') {
                  directPlayable = true;
                }
              }
            }

            const verifiedSubtitles = Array.isArray(payload.tracks)
              ? payload.tracks
                  .filter((t) => {
                    if (!t?.file) return false;
                    try {
                      return new URL(t.file).protocol === 'https:';
                    } catch {
                      return false;
                    }
                  })
                  .map((t) => ({
                    file: t.file,
                    label: t.label || 'Subtitle',
                    kind: t.kind,
                  }))
              : [];

            const latencyMs = Date.now() - startedAt;
            void recordPlaybackSuccess('yenime', latencyMs);

            const serverLabel = directPlayable
              ? `${payload.server ? `${payload.server} · ` : ''}Direct HLS`
              : lang === 'dub'
                ? 'Yenime Embed (SUB player · switch to AniEmbed for DUB)'
                : payload.server
                  ? `${payload.server} · Official Embed`
                  : 'Yenime Official Embed';

            return {
              providerKey: 'yenime',
              providerName: provider.name,
              role: provider.priority <= 1 ? 'primary' : 'backup',
              format: directPlayable ? 'hls' : 'embed',
              embedUrl,
              hlsUrl: directPlayable ? payload.m3u8 || null : null,
              proxiedHlsUrl: null,
              directPlayable,
              directStreamHasAudio,
              subtitles: verifiedSubtitles,
              audioTrack: lang,
              verified: true,
              refreshable: true,
              latencyMs,
              serverLabel,
            };
          }

          // AniEmbed
          const embedUrl = buildProviderEmbedUrl(provider, {
            anilistId,
            malId,
            episode: episodeNumber,
            language: lang,
            autoPlay,
            startSec,
          });
          const parsedEmbed = new URL(embedUrl);
          if (parsedEmbed.protocol !== 'https:') {
            throw new Error('AniEmbed resolved non-HTTPS player URL.');
          }

          const res = await reliableFetch(embedUrl, {
            method: 'GET',
            timeoutMs: TIMEOUTS.STREAM_RESOLUTION_MS,
            maxAttempts: 2,
            externalSignal: options?.signal,
            headers: {
              Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
              'User-Agent': BROWSER_USER_AGENT,
            },
          });

          const html = await res.text().catch(() => '');
          const latencyMs = Date.now() - startedAt;

          const xfo = (res.headers.get('x-frame-options') || '').trim().toUpperCase();
          if (xfo === 'DENY' || xfo === 'SAMEORIGIN') {
            throw new HttpRequestError(
              `AniEmbed blocks iframe embedding (X-Frame-Options: ${xfo}).`,
              { status: res.status, retryable: false }
            );
          }

          if (res.status >= 400 || !(html.includes('<html') || html.includes('<!doctype html'))) {
            throw new HttpRequestError(
              `AniEmbed returned HTTP ${res.status} for episode ${episodeNumber}.`,
              { status: res.status, retryable: res.status >= 500 }
            );
          }

          void recordPlaybackSuccess('aniembed', latencyMs);

          return {
            providerKey: 'aniembed',
            providerName: provider.name,
            role: provider.priority <= 1 ? 'primary' : 'backup',
            format: 'embed',
            embedUrl,
            hlsUrl: null,
            proxiedHlsUrl: null,
            directPlayable: false,
            directStreamHasAudio: 'unknown',
            subtitles: [],
            audioTrack: lang,
            verified: true,
            latencyMs,
            serverLabel: `AniEmbed (${lang.toUpperCase()})`,
          };
        })
      );

      const sources: ResolvedEpisodeSource[] = [];
      settled.forEach((outcome, idx) => {
        const prov = candidates[idx];
        if (outcome.status === 'fulfilled') {
          sources.push(outcome.value);
          diagnosticAttempts.push({
            providerKey: prov.key,
            providerName: prov.name,
            stage: 'completed',
            httpStatus: 200,
            errorCategory: 'none',
            message: `${prov.name} ready (${outcome.value.format.toUpperCase()} · ${outcome.value.latencyMs}ms)`,
            latencyMs: outcome.value.latencyMs,
          });
        } else {
          const reason = outcome.reason;
          const message = sanitizeDiagnosticText(
            reason instanceof Error ? reason.message : String(reason)
          );
          const status = reason instanceof HttpRequestError ? reason.status : undefined;
          errors.push({
            providerKey: prov.key,
            providerName: prov.name,
            message,
            status,
          });
          diagnosticAttempts.push({
            providerKey: prov.key,
            providerName: prov.name,
            stage: status === 422 ? 'audio_support' : 'stream_resolution',
            httpStatus: status ?? null,
            errorCategory: classifyErrorCategory(status, message),
            message,
            latencyMs: 0,
          });
          // Only penalize provider health on network/5xx errors, not when a niche OVA/episode simply returns 404
          if (!status || status >= 500 || status === 429) {
            void recordProviderError(prov.key, message, false);
          }
        }
      });

      // When DUB is requested and Yenime is embed-only (player.yenime.net does not switch URL language to dub),
      // prefer direct-playable HLS/MP4 or AniEmbed (?lang=dub) first so English audio actually plays.
      if (lang === 'dub' && !requestedProvider && sources.length > 1) {
        sources.sort((a, b) => {
          const scoreSource = (s: ResolvedEpisodeSource) => {
            if (s.directPlayable) return 0;
            if (s.providerKey === 'aniembed') return 1;
            return 2;
          };
          return scoreSource(a) - scoreSource(b);
        });
      }

      const preferredSource = sources[0] || null;
      const alternateAvailable = sources.length > 1;
      const suggestedAction = !preferredSource
        ? lang === 'dub'
          ? 'Switch audio to SUB, verify network/adblockers, or check the episode status in Details.'
          : 'Click Retry Playback or test provider connectivity in the Admin Dashboard.'
        : errors.length > 0
          ? `Automatically failed over to ${preferredSource.providerName}.`
          : lang === 'dub' && preferredSource.providerKey === 'yenime' && !preferredSource.directPlayable
            ? 'Yenime embed defaults to SUB. Switch to AniEmbed for verified English DUB audio.'
            : 'Playback source verified.';

      const diagnostics: DiagnosticReport = {
        animeTitle,
        anilistId,
        malId,
        episodeNumber,
        audioTrack: lang,
        requestedProvider: requestedProvider || null,
        attemptedProviders: diagnosticAttempts,
        alternateAvailable,
        suggestedAction,
        generatedAt: new Date().toISOString(),
      };

      return {
        anilistId,
        malId,
        episodeNumber,
        audioTrack: lang,
        sources,
        preferredSource,
        errors,
        allFailed: sources.length === 0,
        diagnostics,
        fetchedAt: new Date().toISOString(),
      };
    }
  );
}

export async function getAnimeStreamingHealth(anilistId: number) {
  const [anime, discovery, providers] = await Promise.all([
    getAnimeDetails(anilistId),
    discoverAnimeEpisodes(anilistId),
    getProviders(true),
  ]);

  return {
    anilistId,
    malId: anime?.idMal ?? null,
    catalogStatus: anime?.status ?? null,
    catalogEpisodes: anime?.episodes ?? null,
    discoveryStatus: discovery.discoveryStatus,
    discoveredEpisodeCount: discovery.discoveredCount,
    partialResults: discovery.partialResults,
    providerDiscovery: discovery.providers,
    providers: providers.map((p) => ({
      key: p.key,
      name: p.name,
      role: p.priority <= 1 ? 'primary' : 'backup',
      isEnabled: p.isEnabled,
      healthState: p.healthState || 'READY',
      averageResponseTimeMs: p.averageResponseTimeMs ?? null,
      consecutiveFailures: p.consecutiveFailures ?? 0,
      lastSuccessAt: p.lastSuccessAt ?? null,
      lastError: p.lastError ?? null,
    })),
    checkedAt: new Date().toISOString(),
  };
}
