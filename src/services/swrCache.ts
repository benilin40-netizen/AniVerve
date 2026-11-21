interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const dataCache = new Map<string, CacheEntry<unknown>>();
const inflightRequests = new Map<string, Promise<unknown>>();

export async function swrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { staleTimeMs?: number; maxAgeMs?: number; forceRefresh?: boolean } = {}
): Promise<T> {
  const staleTimeMs = options.staleTimeMs ?? 60_000;
  const maxAgeMs = options.maxAgeMs ?? 5 * 60_000;
  const now = Date.now();
  const cached = dataCache.get(key) as CacheEntry<T> | undefined;

  if (!options.forceRefresh && cached) {
    const age = now - cached.fetchedAt;
    if (age < staleTimeMs) {
      return cached.data;
    }
    if (age < maxAgeMs) {
      if (!inflightRequests.has(key)) {
        const bgPromise = fetcher()
          .then((fresh) => {
            dataCache.set(key, { data: fresh, fetchedAt: Date.now() });
            return fresh;
          })
          .finally(() => {
            inflightRequests.delete(key);
          });
        inflightRequests.set(key, bgPromise);
      }
      return cached.data;
    }
  }

  const existingInflight = inflightRequests.get(key) as Promise<T> | undefined;
  if (!options.forceRefresh && existingInflight) {
    return existingInflight;
  }

  const promise = fetcher()
    .then((fresh) => {
      dataCache.set(key, { data: fresh, fetchedAt: Date.now() });
      return fresh;
    })
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, promise);
  return promise;
}

export function invalidateSwrCache(prefix?: string): void {
  if (!prefix) {
    dataCache.clear();
    return;
  }
  for (const k of dataCache.keys()) {
    if (k.startsWith(prefix)) {
      dataCache.delete(k);
    }
  }
}
