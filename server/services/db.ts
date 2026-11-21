import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  DatabaseBackupInfo,
  ErrorLogEntry,
  SecurityLogEntry,
  StreamingProvider,
  SystemSettings,
  UnifiedPlaybackTelemetry,
} from '../../src/types/anime.ts';
import {
  validateProviderBaseUrl,
  validateProviderUrlTemplate,
} from '../../src/providers/adapters/index.ts';
import { cleanEnv } from '../utils/env.ts';
import { reliableFetch, TIMEOUTS } from '../utils/httpClient.ts';

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

export const adminAuth = getAuth();

let firestoreClient: Firestore | null = null;
try {
  firestoreClient = getFirestore(getApps()[0], firebaseConfig.firestoreDatabaseId);
} catch (err) {
  console.warn('Firestore Admin initialization fallback:', err);
}

export interface DbHealthState {
  mode: 'firestore' | 'local-store';
  postgresConfigured: boolean;
  supabaseConfigured: boolean;
  lastError: string | null;
  checkedAt: string;
  collectionCounts: Record<string, number>;
  backupCount: number;
}

const healthState: { mode: 'firestore' | 'local-store'; lastError: string | null; checkedAt: string } = {
  mode: firestoreClient ? 'firestore' : 'local-store',
  lastError: null,
  checkedAt: new Date().toISOString(),
};

const DATA_DIR = path.resolve(process.cwd(), '.data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'aniverve-store.json');

type StoreData = Record<string, Record<string, any>>;
let memoryStore: StoreData = {};
let localLoaded = false;

function isLocalDiskAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

function loadLocalStore(): StoreData {
  if (localLoaded) return memoryStore;
  localLoaded = true;
  if (!isLocalDiskAllowed()) {
    return memoryStore;
  }
  try {
    if (fs.existsSync(LOCAL_DB_FILE)) {
      const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        memoryStore = parsed;
      }
    }
  } catch {
    memoryStore = {};
  }
  return memoryStore;
}

function saveLocalStore() {
  if (!isLocalDiskAllowed()) {
    return;
  }
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${LOCAL_DB_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(memoryStore, null, 2), 'utf-8');
    fs.renameSync(tmpFile, LOCAL_DB_FILE);
  } catch {
    // Read-only filesystem - keep in memory
  }
}

function isCredentialOrPermissionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('Could not load the default credentials') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('UNAUTHENTICATED') ||
    msg.includes('Unable to detect a Project Id') ||
    msg.includes('metadata') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('NOT_FOUND')
  );
}

export function listDatabaseBackups(): DatabaseBackupInfo[] {
  if (!isLocalDiskAllowed()) return [];
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('aniverve-backup-') && f.endsWith('.json'))
      .sort()
      .reverse();

    return files.slice(0, 10).map((filename) => {
      const fullPath = path.join(BACKUP_DIR, filename);
      const stat = fs.statSync(fullPath);
      let recordCounts: Record<string, number> = {};
      try {
        const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as StoreData;
        recordCounts = Object.fromEntries(
          Object.entries(parsed).map(([k, v]) => [k, v && typeof v === 'object' ? Object.keys(v).length : 0])
        );
      } catch {
        // ignore parse errors on metadata preview
      }
      return {
        filename,
        createdAt: stat.mtime.toISOString(),
        sizeBytes: stat.size,
        recordCounts,
      };
    });
  } catch {
    return [];
  }
}

export async function createDatabaseBackup(): Promise<DatabaseBackupInfo> {
  const collections = [
    'users',
    'sessions',
    'admin_credentials',
    'admin_sessions',
    'watchlists',
    'favorites',
    'watch_history',
    'user_ratings',
    'user_collections',
    'user_preferences',
    'user_notification_states',
    'premiere_reminders',
    'anime_faceoff_votes',
    'anime_collections',
    'universe_configs',
    'anime_catalog_overrides',
    'anime_providers',
    'playback_telemetry',
    'system_settings',
    'admin_activity',
    'admin_notifications',
    'security_logs',
    'error_logs',
  ];

  const snapshot: StoreData = {};
  const recordCounts: Record<string, number> = {};

  for (const col of collections) {
    const items = await dbList<any>(col);
    snapshot[col] = {};
    for (const item of items) {
      if (item?.id) {
        snapshot[col][item.id] = item;
      }
    }
    recordCounts[col] = items.length;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `aniverve-backup-${stamp}.json`;
  const serialized = JSON.stringify(snapshot, null, 2);

  if (isLocalDiskAllowed()) {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
      const targetPath = path.join(BACKUP_DIR, filename);
      fs.writeFileSync(targetPath, serialized, 'utf-8');

      // Prune older backups beyond 10
      const allBackups = fs
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.startsWith('aniverve-backup-') && f.endsWith('.json'))
        .sort()
        .reverse();
      for (const oldFile of allBackups.slice(10)) {
        fs.unlinkSync(path.join(BACKUP_DIR, oldFile));
      }
    } catch {
      // Ignore write failures
    }
  }

  return {
    filename,
    createdAt: new Date().toISOString(),
    sizeBytes: Buffer.byteLength(serialized, 'utf8'),
    recordCounts,
  };
}

export async function exportDatabaseSnapshot(): Promise<{
  exportedAt: string;
  collections: Record<string, any[]>;
}> {
  const collectionNames = [
    'users',
    'watchlists',
    'favorites',
    'watch_history',
    'user_ratings',
    'user_collections',
    'user_preferences',
    'user_notification_states',
    'premiere_reminders',
    'anime_faceoff_votes',
    'anime_collections',
    'universe_configs',
    'anime_catalog_overrides',
    'anime_providers',
    'system_settings',
    'admin_notifications',
  ];
  const collections: Record<string, any[]> = {};
  for (const name of collectionNames) {
    const items = await dbList<any>(name);
    collections[name] = items.map((item) => {
      if (name === 'users' && item && typeof item === 'object') {
        const { passwordHash: _ph, resetToken: _rt, verificationToken: _vt, ...safeUser } = item;
        return safeUser;
      }
      return item;
    });
  }
  return {
    exportedAt: new Date().toISOString(),
    collections,
  };
}

export function getDbHealth(): DbHealthState {
  const store = loadLocalStore();
  const collectionCounts = Object.fromEntries(
    Object.entries(store).map(([k, v]) => [k, v && typeof v === 'object' ? Object.keys(v).length : 0])
  );
  return {
    mode: healthState.mode,
    postgresConfigured: Boolean(cleanEnv(process.env.DATABASE_URL)),
    supabaseConfigured: Boolean(
      cleanEnv(process.env.SUPABASE_URL) &&
        (cleanEnv(process.env.SUPABASE_ANON_KEY) || cleanEnv(process.env.SUPABASE_PUBLISHABLE_KEY))
    ),
    lastError: healthState.lastError,
    checkedAt: healthState.checkedAt,
    collectionCounts,
    backupCount: listDatabaseBackups().length,
  };
}

export async function dbGet<T = any>(collectionName: string, docId: string): Promise<T | null> {
  if (firestoreClient && healthState.mode === 'firestore') {
    try {
      const snap = await firestoreClient.collection(collectionName).doc(docId).get();
      healthState.checkedAt = new Date().toISOString();
      return snap.exists ? ({ id: snap.id, ...snap.data() } as T) : null;
    } catch (err) {
      if (isCredentialOrPermissionError(err)) {
        healthState.mode = 'local-store';
        healthState.lastError = err instanceof Error ? err.message : String(err);
        healthState.checkedAt = new Date().toISOString();
      } else {
        throw err;
      }
    }
  }
  const store = loadLocalStore();
  const doc = store[collectionName]?.[docId];
  return doc ? ({ id: docId, ...doc } as T) : null;
}

export async function dbSet<T extends Record<string, any>>(
  collectionName: string,
  docId: string,
  data: T
): Promise<T & { id: string }> {
  const payload = { ...data };
  delete (payload as any).id;

  if (firestoreClient && healthState.mode === 'firestore') {
    try {
      await firestoreClient.collection(collectionName).doc(docId).set(payload, { merge: true });
      healthState.checkedAt = new Date().toISOString();
      return { id: docId, ...payload } as T & { id: string };
    } catch (err) {
      if (isCredentialOrPermissionError(err)) {
        healthState.mode = 'local-store';
        healthState.lastError = err instanceof Error ? err.message : String(err);
        healthState.checkedAt = new Date().toISOString();
      } else {
        throw err;
      }
    }
  }

  const store = loadLocalStore();
  if (!store[collectionName]) store[collectionName] = {};
  store[collectionName][docId] = { ...(store[collectionName][docId] || {}), ...payload };
  saveLocalStore();
  return { id: docId, ...store[collectionName][docId] } as T & { id: string };
}

export async function dbDelete(collectionName: string, docId: string): Promise<void> {
  if (firestoreClient && healthState.mode === 'firestore') {
    try {
      await firestoreClient.collection(collectionName).doc(docId).delete();
      healthState.checkedAt = new Date().toISOString();
      return;
    } catch (err) {
      if (isCredentialOrPermissionError(err)) {
        healthState.mode = 'local-store';
        healthState.lastError = err instanceof Error ? err.message : String(err);
        healthState.checkedAt = new Date().toISOString();
      } else {
        throw err;
      }
    }
  }

  const store = loadLocalStore();
  if (store[collectionName]) {
    delete store[collectionName][docId];
    saveLocalStore();
  }
}

export async function dbList<T = any>(
  collectionName: string,
  filterFn?: (item: T) => boolean
): Promise<T[]> {
  let items: T[] = [];
  if (firestoreClient && healthState.mode === 'firestore') {
    try {
      const snap = await firestoreClient.collection(collectionName).get();
      healthState.checkedAt = new Date().toISOString();
      items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
      return filterFn ? items.filter(filterFn) : items;
    } catch (err) {
      if (isCredentialOrPermissionError(err)) {
        healthState.mode = 'local-store';
        healthState.lastError = err instanceof Error ? err.message : String(err);
        healthState.checkedAt = new Date().toISOString();
      } else {
        throw err;
      }
    }
  }

  const store = loadLocalStore();
  const col = store[collectionName] || {};
  items = Object.entries(col).map(([id, val]) => ({ id, ...val }) as T);
  return filterFn ? items.filter(filterFn) : items;
}

export async function logAppError(entry: Omit<ErrorLogEntry, 'id' | 'createdAt'>): Promise<void> {
  try {
    const id = crypto.randomUUID();
    await dbSet<ErrorLogEntry>('error_logs', id, {
      id,
      requestId: entry.requestId ?? null,
      source: String(entry.source || 'server').slice(0, 64),
      route: entry.route ? String(entry.route).slice(0, 200) : null,
      statusCode: entry.statusCode ?? null,
      message: String(entry.message || 'Unknown error').slice(0, 500),
      createdAt: new Date().toISOString(),
    });
    const all = await dbList<ErrorLogEntry>('error_logs');
    if (all.length > 200) {
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      for (const old of all.slice(200)) {
        await dbDelete('error_logs', old.id);
      }
    }
  } catch {
    // Non-blocking error logging
  }
}

export async function logSecurityEvent(
  entry: Omit<SecurityLogEntry, 'id' | 'createdAt'>
): Promise<void> {
  try {
    const id = crypto.randomUUID();
    await dbSet<SecurityLogEntry>('security_logs', id, {
      id,
      userId: entry.userId ?? null,
      email: entry.email ? String(entry.email).slice(0, 160) : null,
      event: String(entry.event).slice(0, 64),
      success: Boolean(entry.success),
      ipAddress: entry.ipAddress ? String(entry.ipAddress).slice(0, 64) : null,
      details: entry.details ? String(entry.details).slice(0, 300) : null,
      createdAt: new Date().toISOString(),
    });
    const all = await dbList<SecurityLogEntry>('security_logs');
    if (all.length > 200) {
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      for (const old of all.slice(200)) {
        await dbDelete('security_logs', old.id);
      }
    }
  } catch {
    // Non-blocking audit logging
  }
}

const ALLOWED_UNIFIED_PROVIDERS = new Set(['yenime', 'aniembed']);

async function probeApiAndEmbed(params: {
  key: 'yenime' | 'aniembed';
  apiUrl: string;
  embedUrl: string;
}): Promise<{
  apiReachable: boolean;
  apiStatus: number;
  embedReachable: boolean;
  embeddingAllowed: boolean;
  embedStatus: number;
  notes: string;
  diagnostics?: StreamingProvider['diagnostics'];
  latencyMs?: number;
}> {
  const fetchWithTimeout = async (url: string, accept: string) => {
    try {
      const res = await reliableFetch(url, {
        method: 'GET',
        redirect: 'follow',
        timeoutMs: TIMEOUTS.PROVIDER_HEALTH_MS,
        maxAttempts: 2,
        headers: { Accept: accept },
      });
      const xfo = (res.headers.get('x-frame-options') || '').trim().toUpperCase();
      const csp = res.headers.get('content-security-policy') || '';
      const frameAncestors = csp
        .split(';')
        .map((d) => d.trim())
        .find((d) => d.toLowerCase().startsWith('frame-ancestors'));
      const cspVal = frameAncestors
        ? frameAncestors.replace(/^frame-ancestors\s+/i, '').trim().toLowerCase()
        : '';
      const blocked =
        xfo === 'DENY' || xfo === 'SAMEORIGIN' || cspVal === "'none'" || cspVal === "'self'";

      let isJson = false;
      if (accept.includes('application/json')) {
        try {
          const text = await res.text();
          JSON.parse(text);
          isJson = true;
        } catch {
          isJson = false;
        }
      } else {
        try {
          await res.body?.cancel();
        } catch {
          // ignore
        }
      }

      return {
        ok: res.status >= 200 && res.status < 400,
        status: res.status,
        blocked,
        frameAncestors,
        isJson,
        error: null as string | null,
      };
    } catch (err) {
      return {
        ok: false,
        status: 0,
        blocked: false,
        frameAncestors: undefined as string | undefined,
        isJson: false,
        error: err instanceof Error ? err.message : 'Probe failed',
      };
    }
  };

  if (params.key === 'yenime') {
    const [apiRes, embedRes] = await Promise.all([
      fetchWithTimeout(params.apiUrl, 'application/json,text/plain;q=0.9,*/*;q=0.8'),
      fetchWithTimeout(params.embedUrl, 'text/html,application/xhtml+xml,*/*;q=0.8'),
    ]);
    const apiReachable = apiRes.ok && (apiRes.isJson || apiRes.status === 200);
    const apiNote = apiRes.error
      ? `API probe error (${apiRes.error})`
      : `API HTTP ${apiRes.status}`;
    const embedNote = embedRes.error
      ? `Player probe error (${embedRes.error})`
      : `Player HTTP ${embedRes.status}${embedRes.frameAncestors ? ` (${embedRes.frameAncestors})` : ''}`;

    return {
      apiReachable,
      apiStatus: apiRes.status,
      embedReachable: embedRes.ok,
      embeddingAllowed: !embedRes.blocked,
      embedStatus: embedRes.status,
      notes: `Technical probe: ${apiNote}; ${embedNote}. Documented distribution permission required before enabling.`,
    };
  }

  // AniEmbed base URL (/e) serves HTML embeds directly rather than a JSON API
  const embedRes = await fetchWithTimeout(params.embedUrl, 'text/html,application/xhtml+xml,*/*;q=0.8');
  return {
    apiReachable: embedRes.ok,
    apiStatus: embedRes.status,
    embedReachable: embedRes.ok,
    embeddingAllowed: !embedRes.blocked,
    embedStatus: embedRes.status,
    notes: `Technical probe: Embed endpoint HTTP ${embedRes.status}${embedRes.frameAncestors ? ` (${embedRes.frameAncestors})` : ' (no framing block headers)'}. Documented distribution permission required before enabling.`,
  };
}

function isAutoProbeOnlyNote(notes?: string | null): boolean {
  if (!notes) return true;
  const lower = notes.toLowerCase();
  return (
    lower.includes('live probe http') ||
    lower.includes('verified via live get probe') ||
    lower.includes('verified via live episode probe') ||
    lower.includes('technical http probe') ||
    lower.includes('technical probe:') ||
    lower === 'primary playback server.' ||
    lower === 'automatic backup server.'
  );
}

let seeded = false;
export async function ensureDefaultSeedData(): Promise<void> {
  if (seeded) return;
  seeded = true;

  try {
    const store = loadLocalStore();
    if (store.news_sources || store.news_articles) {
      delete store.news_sources;
      delete store.news_articles;
      saveLocalStore();
    }

    const existingProviders = await dbList<StreamingProvider & { documentedPermission?: boolean }>('anime_providers');

    // Remove obsolete playback providers while preserving Yenime & AniEmbed
    for (const existing of existingProviders) {
      const providerKey = existing.key || existing.id;
      if (!ALLOWED_UNIFIED_PROVIDERS.has(providerKey)) {
        await dbDelete('anime_providers', existing.id || providerKey);
      }
    }

    const rawEnvYenimeBase = cleanEnv(process.env.YENIME_API_BASE_URL, '');
    const defaultYenimeApiBase =
      rawEnvYenimeBase &&
      validateProviderBaseUrl(rawEnvYenimeBase, {
        requiredBaseHostname: 'api.yenime.net',
        providerName: 'Yenime',
      }).valid
        ? rawEnvYenimeBase
        : 'https://api.yenime.net';

    const rawEnvYenimeTpl = cleanEnv(process.env.YENIME_EMBED_TEMPLATE, '');
    const defaultYenimeEmbedTpl =
      rawEnvYenimeTpl &&
      validateProviderUrlTemplate(rawEnvYenimeTpl, {
        requiredHostname: 'player.yenime.net',
        requiredPlaceholders: ['{ANILIST_ID}', '{EPISODE}'],
        forbiddenPlaceholders: ['{LANG}', '{AUTOPLAY}', '{START}'],
        providerName: 'Yenime',
      }).valid
        ? rawEnvYenimeTpl
        : 'https://player.yenime.net/anime/ani/{ANILIST_ID}/{EPISODE}';

    const rawEnvAniEmbedBase = cleanEnv(process.env.ANIEMBED_BASE_URL, '');
    const defaultAniEmbedBase =
      rawEnvAniEmbedBase &&
      validateProviderBaseUrl(rawEnvAniEmbedBase, {
        requiredBaseHostname: 'aniembed.se',
        providerName: 'AniEmbed',
      }).valid
        ? rawEnvAniEmbedBase
        : 'https://aniembed.se/e';

    const rawEnvAniEmbedTpl = cleanEnv(process.env.ANIEMBED_EMBED_TEMPLATE, '');
    const defaultAniEmbedTpl =
      rawEnvAniEmbedTpl &&
      validateProviderUrlTemplate(rawEnvAniEmbedTpl, {
        requiredHostname: 'aniembed.se',
        requiredPlaceholders: ['{ANILIST_ID}', '{EPISODE}', '{LANG}', '{AUTOPLAY}', '{START}'],
        providerName: 'AniEmbed',
      }).valid
        ? rawEnvAniEmbedTpl
        : 'https://aniembed.se/e/{ANILIST_ID}/{EPISODE}?lang={LANG}&autoplay={AUTOPLAY}&t={START}';

    const existingYenime = existingProviders.find((p) => (p.key || p.id) === 'yenime');
    const existingAniEmbed = existingProviders.find((p) => (p.key || p.id) === 'aniembed');

    // Preserve valid admin customizations; repair missing or malformed values only
    const yenimeBaseValid = existingYenime
      ? validateProviderBaseUrl(existingYenime.baseUrl, {
          requiredBaseHostname: 'api.yenime.net',
          providerName: 'Yenime',
        }).valid
      : false;
    const yenimeTplValid = existingYenime
      ? validateProviderUrlTemplate(existingYenime.urlTemplate, {
          requiredHostname: 'player.yenime.net',
          requiredPlaceholders: ['{ANILIST_ID}', '{EPISODE}'],
          forbiddenPlaceholders: ['{LANG}', '{AUTOPLAY}', '{START}'],
          providerName: 'Yenime',
        }).valid
      : false;

    const aniEmbedBaseValid = existingAniEmbed
      ? validateProviderBaseUrl(existingAniEmbed.baseUrl, {
          requiredBaseHostname: 'aniembed.se',
          providerName: 'AniEmbed',
        }).valid
      : false;
    const aniEmbedTplValid = existingAniEmbed
      ? validateProviderUrlTemplate(existingAniEmbed.urlTemplate, {
          requiredHostname: 'aniembed.se',
          requiredPlaceholders: ['{ANILIST_ID}', '{EPISODE}', '{LANG}', '{AUTOPLAY}', '{START}'],
          providerName: 'AniEmbed',
        }).valid
      : false;

    const effectiveYenimeBase = yenimeBaseValid ? existingYenime!.baseUrl!.trim() : defaultYenimeApiBase;
    const effectiveYenimeTpl = yenimeTplValid ? existingYenime!.urlTemplate.trim() : defaultYenimeEmbedTpl;

    const effectiveAniEmbedBase = aniEmbedBaseValid ? existingAniEmbed!.baseUrl!.trim() : defaultAniEmbedBase;
    const effectiveAniEmbedTpl = aniEmbedTplValid ? existingAniEmbed!.urlTemplate.trim() : defaultAniEmbedTpl;

    const needsYenimeProbe =
      !existingYenime ||
      !yenimeBaseValid ||
      !yenimeTplValid ||
      existingYenime.apiReachable === undefined;
    const needsAniEmbedProbe =
      !existingAniEmbed ||
      !aniEmbedBaseValid ||
      !aniEmbedTplValid ||
      existingAniEmbed.apiReachable === undefined;

    const [yenimeProbe, aniEmbedProbe] = await Promise.all([
      needsYenimeProbe
        ? probeApiAndEmbed({
            key: 'yenime',
            apiUrl: effectiveYenimeBase,
            embedUrl: effectiveYenimeTpl.replaceAll('{ANILIST_ID}', '16498').replaceAll('{EPISODE}', '1'),
          })
        : Promise.resolve(null),
      needsAniEmbedProbe
        ? probeApiAndEmbed({
            key: 'aniembed',
            apiUrl: effectiveAniEmbedBase,
            embedUrl: effectiveAniEmbedTpl
              .replaceAll('{ANILIST_ID}', '16498')
              .replaceAll('{EPISODE}', '1')
              .replaceAll('{LANG}', 'sub')
              .replaceAll('{AUTOPLAY}', '0')
              .replaceAll('{START}', '0'),
          })
        : Promise.resolve(null),
    ]);

    const now = new Date().toISOString();

    const buildTruthfulProvider = (
      key: 'yenime' | 'aniembed',
      defaultName: string,
      defaultRole: 'primary' | 'backup',
      baseUrl: string,
      urlTemplate: string,
      defaultPriority: number,
      existing: (StreamingProvider & { documentedPermission?: boolean }) | undefined,
      probe: Awaited<ReturnType<typeof probeApiAndEmbed>> | null
    ): StreamingProvider & { documentedPermission?: boolean } => {
      const priority = Number.isFinite(existing?.priority) ? Number(existing!.priority) : defaultPriority;
      const role: 'primary' | 'backup' = priority <= 1 ? 'primary' : 'backup';

      const embeddingAllowed = probe
        ? probe.embeddingAllowed
        : existing?.embeddingAllowed ?? true;
      const apiReachable = probe
        ? probe.apiReachable
        : existing?.apiReachable ?? false;
      const lastHttpStatus = probe?.apiStatus ?? existing?.lastHttpStatus ?? null;
      const reachable = probe
        ? probe.apiReachable || probe.embedReachable
        : Boolean(lastHttpStatus && lastHttpStatus >= 200 && lastHttpStatus < 400 && (existing?.isEnabled || existing?.apiReachable));

      const hasExplicitDocumentedPermission =
        (Boolean(existing?.documentedPermission) || Boolean(existing?.licenseVerified)) &&
        !isAutoProbeOnlyNote(existing?.verificationNotes);

      const isExplicitlyEnabled = Boolean(existing?.isEnabled) && hasExplicitDocumentedPermission && embeddingAllowed !== false;

      const healthState = !urlTemplate || !baseUrl
        ? 'FAILED'
        : !reachable
          ? 'FAILED'
          : lastHttpStatus && lastHttpStatus >= 400
            ? 'DEGRADED'
            : existing?.healthState === 'FAILED'
              ? 'RECOVERING'
              : 'READY';

      const availabilityStatus = !urlTemplate || !baseUrl
        ? 'unconfigured'
        : embeddingAllowed === false
          ? 'restricted'
          : !reachable
            ? 'unreachable'
            : hasExplicitDocumentedPermission
              ? 'available'
              : 'unverified';

      return {
        id: key,
        key,
        name: existing?.name?.trim() || defaultName,
        role: existing?.role || role || defaultRole,
        adapterType: key,
        baseUrl,
        urlTemplate,
        supportedIdTypes: key === 'yenime' ? ['mal', 'anilist'] : ['anilist'],
        supportedLanguages: existing?.supportedLanguages?.length ? existing.supportedLanguages : ['sub', 'dub'],
        supportedFormats: key === 'yenime' ? ['hls', 'embed'] : ['embed'],
        isEnabled: isExplicitlyEnabled,
        licenseVerified: hasExplicitDocumentedPermission,
        documentedPermission: hasExplicitDocumentedPermission,
        embeddingAllowed,
        apiReachable,
        playerInitialized: existing?.playerInitialized ?? null,
        healthState,
        consecutiveFailures: reachable ? 0 : (existing?.consecutiveFailures || 0) + 1,
        averageResponseTimeMs: probe?.latencyMs ?? existing?.averageResponseTimeMs ?? null,
        diagnostics: probe?.diagnostics || existing?.diagnostics,
        availabilityStatus,
        verificationNotes: hasExplicitDocumentedPermission
          ? existing?.verificationNotes || null
          : probe
            ? `${role === 'primary' ? 'Primary server' : 'Backup server'}. ${probe.notes} Documented permission required before enabling.`
            : existing?.verificationNotes ||
              `Technical probe checked (HTTP ${lastHttpStatus ?? 'N/A'}); documented distribution permission required before enabling.`,
        verifiedAt: hasExplicitDocumentedPermission ? existing?.verifiedAt || now : null,
        lastHttpStatus,
        lastSuccessAt: reachable ? existing?.lastSuccessAt || now : existing?.lastSuccessAt ?? null,
        priority,
        errorCount: existing?.errorCount ?? 0,
        lastError: probe && !reachable ? probe.notes : existing?.lastError ?? null,
        lastCheckedAt: probe ? now : existing?.lastCheckedAt ?? now,
      };
    };

    const canonicalProviders = [
      buildTruthfulProvider(
        'yenime',
        'Yenime',
        'primary',
        effectiveYenimeBase,
        effectiveYenimeTpl,
        1,
        existingYenime,
        yenimeProbe
      ),
      buildTruthfulProvider(
        'aniembed',
        'AniEmbed',
        'backup',
        effectiveAniEmbedBase,
        effectiveAniEmbedTpl,
        2,
        existingAniEmbed,
        aniEmbedProbe
      ),
    ];

    for (const seed of canonicalProviders) {
      await dbSet('anime_providers', seed.key, seed);
    }

    const telemetry = await dbGet<UnifiedPlaybackTelemetry>('playback_telemetry', 'unified');
    if (!telemetry) {
      await dbSet('playback_telemetry', 'unified', {
        currentActiveServer: 'none',
        lastSuccessfulInitAt: null,
        lastSuccessfulServer: null,
        lastError: null,
        lastFallbackEvent: null,
        failoverCount: 0,
      });
    }

    const siteSettings = await dbGet<SystemSettings>('system_settings', 'global');
    if (!siteSettings) {
      await dbSet('system_settings', 'global', {
        siteName: 'AniVerve',
        logoUrl: '',
        faviconUrl: '',
        accentColor: '#9b87ff',
        maintenanceMode: false,
        allowRegistration: true,
        seoTitle: 'AniVerve – Anime Discovery, Live Airing Schedule & Streaming',
        seoDescription:
          'Discover trending anime, track live airing countdowns, manage your watchlist, and stream episodes on AniVerve.',
        featuredSections: ['trending', 'airing', 'popular', 'movies', 'upcoming'],
      });
    }
  } catch (err) {
    console.error('Failed seeding initial records:', err);
  }
}
