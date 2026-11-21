import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cleanEnv } from './env.ts';

const SECRETS_FILE = path.resolve(process.cwd(), '.data', '.runtime-secrets.json');
const GLOBAL_CACHE_KEY = '__ANIVERVE_RUNTIME_SECRETS__';

function getGlobalCache(): Record<string, string> {
  const g = globalThis as Record<string, any>;
  if (!g[GLOBAL_CACHE_KEY]) {
    g[GLOBAL_CACHE_KEY] = {};
  }
  return g[GLOBAL_CACHE_KEY] as Record<string, string>;
}

/**
 * Ensures critical authentication secrets are configured before booting in production.
 */
export function assertProductionEnvironment(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const missing: string[] = [];
  const authSecret = cleanEnv(process.env.AUTH_SECRET);
  const adminPassword = cleanEnv(process.env.ADMIN_ACCESS_PASSWORD);

  if (!authSecret || authSecret.length < 32 || authSecret.includes('replace-with-a-64-char')) {
    missing.push('AUTH_SECRET (minimum 32 characters)');
  }
  if (!adminPassword || adminPassword.length < 10) {
    missing.push('ADMIN_ACCESS_PASSWORD (minimum 10 characters)');
  }

  if (missing.length > 0) {
    throw new Error(
      `[AniVerve Startup Blocked] Production boot refused because required environment variables are missing or insecure: ${missing.join(', ')}.`
    );
  }
}

/**
 * Resolves a signing secret from environment variables, or falls back to a
 * cryptographically random 256-bit secret persisted locally ONLY in non-production
 * development (never reads from or writes inside process.cwd() in production).
 */
export function resolveRuntimeSecret(
  primaryEnvVar: string,
  fallbackEnvVars: string[] = []
): string {
  for (const key of [primaryEnvVar, ...fallbackEnvVars]) {
    const val = cleanEnv(process.env[key]);
    if (val) return val;
  }

  const cache = getGlobalCache();
  if (cache[primaryEnvVar]) {
    return cache[primaryEnvVar];
  }

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    let stored: Record<string, string> = {};
    try {
      if (fs.existsSync(SECRETS_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          stored = parsed;
        }
      }
    } catch {
      stored = {};
    }

    if (typeof stored[primaryEnvVar] === 'string' && stored[primaryEnvVar].length >= 32) {
      cache[primaryEnvVar] = stored[primaryEnvVar];
      return stored[primaryEnvVar];
    }

    const generated = crypto.randomBytes(32).toString('hex');
    cache[primaryEnvVar] = generated;
    stored[primaryEnvVar] = generated;

    try {
      const dir = path.dirname(SECRETS_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(SECRETS_FILE, JSON.stringify(stored, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
    } catch {
      // Ignore write failures on ephemeral dev filesystems
    }

    return generated;
  }

  // Production without env var (e.g. pre-validation module import): keep strictly in memory, never touch disk
  const ephemeral = crypto.randomBytes(32).toString('hex');
  cache[primaryEnvVar] = ephemeral;
  return ephemeral;
}
