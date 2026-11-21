import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { dbDelete, dbGet, dbList, dbSet } from './db.ts';
import { cleanEnv } from '../utils/env.ts';
import { resolveRuntimeSecret } from '../utils/runtimeSecrets.ts';
import type { AdminSessionInfo } from '../../src/types/anime.ts';

const ADMIN_CREDENTIAL_DOC = 'primary';
const BCRYPT_ROUNDS = 12;
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

const ADMIN_JWT_SECRET = resolveRuntimeSecret('ADMIN_SESSION_SECRET', ['AUTH_SECRET']);

export interface AdminCredentialRecord {
  id: string;
  passwordHash: string;
  mustChangePassword: boolean;
  usingEnvPassword: boolean;
  envPasswordFingerprint?: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface AdminSessionRecord {
  id: string;
  tokenHash: string;
  csrfToken: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  expiresAt: string;
  lastActiveAt: string;
  createdAt: string;
}

interface LockoutBucket {
  failures: number;
  lockedUntil: number;
  lastAttemptAt: number;
}

const lockoutBuckets = new Map<string, LockoutBucket>();
let generatedBootstrapLogged = false;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function fingerprintPassword(pw: string): string {
  return crypto.createHash('sha256').update(`env-fp:${pw}`, 'utf8').digest('hex');
}

export function validateAdminPasswordStrength(password: string): string | null {
  if (typeof password !== 'string' || password.length < 10) {
    return 'Administrator password must be at least 10 characters long.';
  }
  if (password.length > 128) {
    return 'Administrator password must be 128 characters or fewer.';
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Administrator password must contain uppercase, lowercase, and numeric characters.';
  }
  return null;
}

export function timingSafeEqualStrings(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export async function ensureAdminCredentialInitialized(): Promise<AdminCredentialRecord> {
  const existing = await dbGet<AdminCredentialRecord>('admin_credentials', ADMIN_CREDENTIAL_DOC);
  const envPassword = cleanEnv(process.env.ADMIN_ACCESS_PASSWORD, '');
  const now = new Date().toISOString();

  if (existing && existing.passwordHash) {
    // If operator intentionally supplied or rotated ADMIN_ACCESS_PASSWORD in env
    // and stored credential was still using an older env password, sync cleanly.
    if (
      envPassword &&
      existing.usingEnvPassword &&
      existing.envPasswordFingerprint !== fingerprintPassword(envPassword)
    ) {
      const updatedHash = await bcrypt.hash(envPassword, BCRYPT_ROUNDS);
      const updated: AdminCredentialRecord = {
        ...existing,
        passwordHash: updatedHash,
        envPasswordFingerprint: fingerprintPassword(envPassword),
        mustChangePassword: false,
        usingEnvPassword: true,
        updatedAt: now,
      };
      await dbSet('admin_credentials', ADMIN_CREDENTIAL_DOC, updated);
      return updated;
    }
    return existing;
  }

  let initialPassword = envPassword;
  let mustChange = false;
  let usingEnv = true;

  if (!initialPassword) {
    initialPassword = `AV-${crypto.randomBytes(12).toString('base64url')}-9`;
    mustChange = true;
    usingEnv = false;
    if (!generatedBootstrapLogged) {
      generatedBootstrapLogged = true;
      console.warn(
        `\n[AniVerve Admin Security] ADMIN_ACCESS_PASSWORD is not set in environment.\n` +
          `Generated initial one-time administrator password (change immediately after login):\n` +
          `  ${initialPassword}\n`
      );
    }
  }

  const passwordHash = await bcrypt.hash(initialPassword, BCRYPT_ROUNDS);
  const record: AdminCredentialRecord = {
    id: ADMIN_CREDENTIAL_DOC,
    passwordHash,
    mustChangePassword: mustChange,
    usingEnvPassword: usingEnv,
    envPasswordFingerprint: usingEnv ? fingerprintPassword(initialPassword) : null,
    createdAt: now,
    updatedAt: now,
  };
  await dbSet('admin_credentials', ADMIN_CREDENTIAL_DOC, record);
  return record;
}

export function checkAdminLoginLockout(ip: string): { blocked: boolean; retryAfterSec: number } {
  const key = ip || 'unknown';
  const bucket = lockoutBuckets.get(key);
  const now = Date.now();
  if (!bucket) return { blocked: false, retryAfterSec: 0 };
  if (bucket.lockedUntil > now) {
    return {
      blocked: true,
      retryAfterSec: Math.max(1, Math.ceil((bucket.lockedUntil - now) / 1000)),
    };
  }
  if (now - bucket.lastAttemptAt > 15 * 60 * 1000) {
    lockoutBuckets.delete(key);
  }
  return { blocked: false, retryAfterSec: 0 };
}

function recordFailedAdminAttempt(ip: string): number {
  const key = ip || 'unknown';
  const now = Date.now();
  const prev = lockoutBuckets.get(key) || { failures: 0, lockedUntil: 0, lastAttemptAt: now };
  const failures = prev.failures + 1;
  let lockMs = 0;
  if (failures >= 10) {
    lockMs = 15 * 60 * 1000;
  } else if (failures >= 5) {
    lockMs = Math.min(5 * 60 * 1000, (failures - 4) * 30 * 1000);
  }
  lockoutBuckets.set(key, {
    failures,
    lockedUntil: lockMs > 0 ? now + lockMs : 0,
    lastAttemptAt: now,
  });
  return Math.ceil(lockMs / 1000);
}

function clearAdminAttempts(ip: string) {
  lockoutBuckets.delete(ip || 'unknown');
}

export async function verifyAdminPasswordAndCreateSession(input: {
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{
  token: string;
  csrfToken: string;
  session: AdminSessionRecord;
  credential: AdminCredentialRecord;
}> {
  const ip = input.ipAddress || 'unknown';
  const lockout = checkAdminLoginLockout(ip);
  if (lockout.blocked) {
    throw new Error(
      `Too many failed administrator login attempts. Try again in ${lockout.retryAfterSec} seconds.`
    );
  }

  const provided = typeof input.password === 'string' ? input.password : '';
  if (!provided) {
    throw new Error('Administrator password is required.');
  }

  const cred = await ensureAdminCredentialInitialized();
  const valid = await bcrypt.compare(provided, cred.passwordHash);
  if (!valid) {
    const lockSec = recordFailedAdminAttempt(ip);
    if (lockSec > 0) {
      throw new Error(`Invalid administrator password. Console locked for ${lockSec} seconds.`);
    }
    throw new Error('Invalid administrator password.');
  }

  clearAdminAttempts(ip);

  const sessionId = crypto.randomUUID();
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const token = jwt.sign({ sid: sessionId, scope: 'aniverve_admin' }, ADMIN_JWT_SECRET, {
    expiresIn: SESSION_TTL_SECONDS,
  });
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();

  const session: AdminSessionRecord = {
    id: sessionId,
    tokenHash: hashToken(token),
    csrfToken,
    ipAddress: input.ipAddress ? String(input.ipAddress).slice(0, 64) : null,
    userAgent: input.userAgent ? String(input.userAgent).slice(0, 220) : null,
    expiresAt,
    lastActiveAt: now.toISOString(),
    createdAt: now.toISOString(),
  };

  await dbSet('admin_sessions', sessionId, session);
  return { token, csrfToken, session, credential: cred };
}

export async function verifyAdminSessionToken(token?: string | null): Promise<{
  session: AdminSessionRecord;
  credential: AdminCredentialRecord;
} | null> {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET) as { sid?: string; scope?: string };
    if (!decoded?.sid || decoded.scope !== 'aniverve_admin') return null;

    const session = await dbGet<AdminSessionRecord>('admin_sessions', decoded.sid);
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await dbDelete('admin_sessions', decoded.sid);
      return null;
    }
    if (!timingSafeEqualStrings(session.tokenHash, hashToken(token))) {
      return null;
    }

    const credential = await ensureAdminCredentialInitialized();
    // Refresh lastActiveAt at most once per 60s
    if (Date.now() - new Date(session.lastActiveAt).getTime() > 60_000) {
      await dbSet('admin_sessions', session.id, {
        ...session,
        lastActiveAt: new Date().toISOString(),
      });
    }

    return { session, credential };
  } catch {
    return null;
  }
}

export async function getAdminSessionStatus(token?: string | null): Promise<AdminSessionInfo> {
  const verified = await verifyAdminSessionToken(token);
  if (!verified) {
    return {
      authenticated: false,
      mustChangePassword: false,
      authMode: 'backend-password',
    };
  }
  return {
    authenticated: true,
    mustChangePassword: Boolean(verified.credential.mustChangePassword),
    sessionId: verified.session.id,
    expiresAt: verified.session.expiresAt,
    csrfToken: verified.session.csrfToken,
    usingEnvPassword: verified.credential.usingEnvPassword,
    authMode: 'backend-password',
  };
}

export async function revokeAdminSession(token?: string | null): Promise<void> {
  if (!token) return;
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET) as { sid?: string };
    if (decoded?.sid) {
      await dbDelete('admin_sessions', decoded.sid);
    }
  } catch {
    // Ignore invalid/expired JWT on logout
  }
}

export async function listActiveAdminSessions(currentSessionId?: string | null) {
  const now = Date.now();
  const rows = await dbList<AdminSessionRecord>('admin_sessions');
  const active: Array<Omit<AdminSessionRecord, 'tokenHash' | 'csrfToken'> & { current: boolean }> = [];
  for (const row of rows) {
    if (new Date(row.expiresAt).getTime() <= now) {
      await dbDelete('admin_sessions', row.id);
      continue;
    }
    active.push({
      id: row.id,
      ipAddress: row.ipAddress ?? null,
      userAgent: row.userAgent ?? null,
      expiresAt: row.expiresAt,
      lastActiveAt: row.lastActiveAt,
      createdAt: row.createdAt,
      current: Boolean(currentSessionId && row.id === currentSessionId),
    });
  }
  return active.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function revokeAdminSessionById(sessionId: string): Promise<boolean> {
  const existing = await dbGet<AdminSessionRecord>('admin_sessions', sessionId);
  if (!existing) return false;
  await dbDelete('admin_sessions', sessionId);
  return true;
}

export async function revokeAllAdminSessions(keepSessionId?: string | null): Promise<number> {
  const rows = await dbList<AdminSessionRecord>('admin_sessions');
  let revoked = 0;
  for (const row of rows) {
    if (keepSessionId && row.id === keepSessionId) continue;
    await dbDelete('admin_sessions', row.id);
    revoked++;
  }
  return revoked;
}

export async function changeAdminPassword(input: {
  currentPassword: string;
  newPassword: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{
  token: string;
  csrfToken: string;
  session: AdminSessionRecord;
  revokedSessions: number;
}> {
  const cred = await ensureAdminCredentialInitialized();
  const validCurrent = await bcrypt.compare(String(input.currentPassword || ''), cred.passwordHash);
  if (!validCurrent) {
    throw new Error('Current administrator password is incorrect.');
  }

  const strengthErr = validateAdminPasswordStrength(input.newPassword);
  if (strengthErr) {
    throw new Error(strengthErr);
  }

  if (timingSafeEqualStrings(input.currentPassword, input.newPassword)) {
    throw new Error('New password must differ from the current password.');
  }

  const nextHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
  const now = new Date().toISOString();
  await dbSet<AdminCredentialRecord>('admin_credentials', ADMIN_CREDENTIAL_DOC, {
    ...cred,
    passwordHash: nextHash,
    mustChangePassword: false,
    usingEnvPassword: false,
    envPasswordFingerprint: null,
    updatedAt: now,
  });

  // Invalidate every existing admin session and issue a clean fresh session
  const revokedSessions = await revokeAllAdminSessions(null);
  const sessionId = crypto.randomUUID();
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const token = jwt.sign({ sid: sessionId, scope: 'aniverve_admin' }, ADMIN_JWT_SECRET, {
    expiresIn: SESSION_TTL_SECONDS,
  });
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  const session: AdminSessionRecord = {
    id: sessionId,
    tokenHash: hashToken(token),
    csrfToken,
    ipAddress: input.ipAddress ? String(input.ipAddress).slice(0, 64) : null,
    userAgent: input.userAgent ? String(input.userAgent).slice(0, 220) : null,
    expiresAt,
    lastActiveAt: now,
    createdAt: now,
  };
  await dbSet('admin_sessions', sessionId, session);

  return { token, csrfToken, session, revokedSessions };
}
