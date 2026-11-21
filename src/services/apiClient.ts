let memoryToken: string | null = null;
let memoryAdminCsrfToken: string | null = null;

export const API_TIMEOUTS = {
  CATALOG_MS: 20_000,
  EPISODES_MS: 30_000,
  STREAM_MS: 45_000,
} as const;

export function setAuthToken(token: string | null) {
  memoryToken = token;
}

export function getAuthToken(): string | null {
  return memoryToken;
}

export function setAdminCsrfToken(token: string | null) {
  memoryAdminCsrfToken = token;
}

export function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

export class ApiError<T = unknown> extends Error {
  status: number;
  data: T | null;

  constructor(message: string, status: number, data: T | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = API_TIMEOUTS.CATALOG_MS, ...fetchOptions } = options;
  const method = (fetchOptions.method || 'GET').toUpperCase();
  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const headers = new Headers(fetchOptions.headers || {});
  if (!headers.has('Content-Type') && fetchOptions.body && typeof fetchOptions.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (memoryToken && !headers.has('Authorization') && !url.startsWith('/api/admin')) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
  }
  if (url.startsWith('/api/admin')) {
    const csrf = memoryAdminCsrfToken || readCookieValue('aniverve_admin_csrf');
    if (csrf && !headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', csrf);
    }
  } else if (isMutation && (url.startsWith('/api/auth') || url.startsWith('/api/user'))) {
    const userCsrf = readCookieValue('aniverve_user_csrf');
    if (userCsrf && !headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', userCsrf);
    }
  }

  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  if (fetchOptions.signal) {
    if (fetchOptions.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    fetchOptions.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (fetchOptions.signal) {
      fetchOptions.signal.removeEventListener('abort', onExternalAbort);
    }

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? ((await res.json()) as Record<string, unknown> | null)
      : null;

    if (!res.ok) {
      const errorMsg =
        data && typeof data.error === 'string' ? data.error : `Request failed (${res.status})`;
      throw new ApiError(errorMsg, res.status, data);
    }

    return data as T;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (fetchOptions.signal) {
      fetchOptions.signal.removeEventListener('abort', onExternalAbort);
    }
    if (timedOut) {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    if (
      fetchOptions.signal?.aborted ||
      (err instanceof Error && err.name === 'AbortError')
    ) {
      throw new DOMException('Aborted', 'AbortError');
    }
    throw err;
  }
}
