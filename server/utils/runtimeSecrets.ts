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
 * Resolves a signing secret from environment variables, or falls back to a
 * cryptographically random 256-bit secret persisted locally for development
 * convenience (never derived deterministically from predictable inputs).
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

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      `[AniVerve Security] Environment variable ${primaryEnvVar} is not set. Generated an ephemeral runtime secret.`
    );
  }

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
    // Read-only filesystem (e.g. serverless): ephemeral in-memory secret stays cached in globalThis
  }

  return generated;
}
