import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { AccountStatus, UserProfile, UserRole, UserSessionInfo } from '../../src/types/anime.ts';
import { dbDelete, dbGet, dbList, dbSet } from './db.ts';
import { resolveRuntimeSecret } from '../utils/runtimeSecrets.ts';

const AUTH_SECRET = resolveRuntimeSecret('AUTH_SECRET');

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface StoredUserRecord {
  id: string;
  uid?: string;
  email: string;
  username: string;
  passwordHash?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  role: UserRole;
  status: AccountStatus;
  emailVerified: boolean;
  verificationToken?: string | null;
  resetToken?: string | null;
  resetTokenExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  expiresAt: string;
  createdAt: string;
}

export function sanitizeUser(user: StoredUserRecord): UserProfile {
  return {
    id: user.id,
    uid: user.uid,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatarUrl || null,
    bio: user.bio || null,
    role: user.role,
    status: user.status,
    emailVerified: Boolean(user.emailVerified),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function validatePasswordStrength(password: string): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (password.length > 128) {
    return 'Password must be 128 characters or fewer.';
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

export function getSessionIdFromToken(token?: string | null): string | null {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, AUTH_SECRET) as { sid?: string };
    return decoded.sid || null;
  } catch {
    return null;
  }
}

export async function createSession(
  userId: string,
  meta?: { userAgent?: string | null; ipAddress?: string | null }
): Promise<{ token: string; expiresAt: string; sessionId: string }> {
  const sessionId = crypto.randomUUID();
  const token = jwt.sign({ sub: userId, sid: sessionId }, AUTH_SECRET, {
    expiresIn: TOKEN_TTL_SECONDS,
  });
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();

  await dbSet<SessionRecord>('sessions', sessionId, {
    id: sessionId,
    userId,
    tokenHash: hashToken(token),
    userAgent: meta?.userAgent ? String(meta.userAgent).slice(0, 220) : null,
    ipAddress: meta?.ipAddress ? String(meta.ipAddress).slice(0, 64) : null,
    expiresAt,
    createdAt: new Date().toISOString(),
  });

  return { token, expiresAt, sessionId };
}

export async function verifySessionToken(token: string): Promise<StoredUserRecord | null> {
  try {
    const decoded = jwt.verify(token, AUTH_SECRET) as { sub: string; sid: string };
    const session = await dbGet<SessionRecord>('sessions', decoded.sid);
    if (!session || session.userId !== decoded.sub) return null;
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      await dbDelete('sessions', decoded.sid);
      return null;
    }
    if (session.tokenHash !== hashToken(token)) return null;

    const user = await dbGet<StoredUserRecord>('users', decoded.sub);
    if (!user || user.status === 'SUSPENDED') return null;
    return user;
  } catch {
    return null;
  }
}

export async function revokeSession(token: string): Promise<void> {
  try {
    const decoded = jwt.verify(token, AUTH_SECRET) as { sid: string };
    if (decoded.sid) {
      await dbDelete('sessions', decoded.sid);
    }
  } catch {
    // Ignore expired/invalid token on logout
  }
}

export async function listUserSessions(
  userId: string,
  currentSessionId?: string | null
): Promise<UserSessionInfo[]> {
  const now = Date.now();
  const sessions = await dbList<SessionRecord>('sessions', (s) => s.userId === userId);
  const active: UserSessionInfo[] = [];

  for (const s of sessions) {
    if (new Date(s.expiresAt).getTime() < now) {
      await dbDelete('sessions', s.id);
      continue;
    }
    active.push({
      id: s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      userAgent: s.userAgent ?? null,
      ipAddress: s.ipAddress ?? null,
      current: Boolean(currentSessionId && s.id === currentSessionId),
    });
  }

  return active.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function revokeSessionById(userId: string, sessionId: string): Promise<boolean> {
  const session = await dbGet<SessionRecord>('sessions', sessionId);
  if (!session || session.userId !== userId) {
    return false;
  }
  await dbDelete('sessions', sessionId);
  return true;
}

export async function revokeOtherUserSessions(
  userId: string,
  keepSessionId?: string | null
): Promise<number> {
  const sessions = await dbList<SessionRecord>('sessions', (s) => s.userId === userId);
  let revoked = 0;
  for (const s of sessions) {
    if (keepSessionId && s.id === keepSessionId) continue;
    await dbDelete('sessions', s.id);
    revoked++;
  }
  return revoked;
}

export async function findUserByEmail(email: string): Promise<StoredUserRecord | null> {
  const normalized = email.trim().toLowerCase();
  const users = await dbList<StoredUserRecord>('users', (u) => u.email?.toLowerCase() === normalized);
  return users[0] || null;
}

export async function findUserByUsername(username: string): Promise<StoredUserRecord | null> {
  const normalized = username.trim().toLowerCase();
  const users = await dbList<StoredUserRecord>(
    'users',
    (u) => u.username?.toLowerCase() === normalized
  );
  return users[0] || null;
}

export async function registerEmailUser(input: {
  email: string;
  username: string;
  password: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}): Promise<{ user: UserProfile; token: string; verificationToken: string }> {
  const email = input.email.trim().toLowerCase();
  const username = input.username.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Please enter a valid email address.');
  }
  if (username.length < 2 || username.length > 32 || !/^[a-zA-Z0-9_.\- ]+$/.test(username)) {
    throw new Error('Username must be 2–32 characters and use letters, numbers, spaces, _, ., or -.');
  }
  const strengthErr = validatePasswordStrength(input.password);
  if (strengthErr) {
    throw new Error(strengthErr);
  }

  const existingEmail = await findUserByEmail(email);
  if (existingEmail) {
    throw new Error('An account with this email already exists.');
  }

  const existingUsername = await findUserByUsername(username);
  if (existingUsername) {
    throw new Error('This username is already taken.');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);
  const verificationToken = crypto.randomBytes(24).toString('hex');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Public registration NEVER grants ADMIN or SUPER_ADMIN
  const record: StoredUserRecord = {
    id,
    uid: id,
    email,
    username,
    passwordHash,
    avatarUrl: null,
    bio: '',
    role: 'USER',
    status: 'ACTIVE',
    emailVerified: false,
    verificationToken,
    resetToken: null,
    resetTokenExpiresAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await dbSet('users', id, record);
  const session = await createSession(id, {
    userAgent: input.userAgent,
    ipAddress: input.ipAddress,
  });
  return { user: sanitizeUser(record), token: session.token, verificationToken };
}

export async function loginEmailUser(input: {
  email: string;
  password: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}): Promise<{ user: UserProfile; token: string }> {
  const email = input.email.trim().toLowerCase();
  const user = await findUserByEmail(email);
  if (!user || !user.passwordHash) {
    throw new Error('Invalid email or password.');
  }
  if (user.status === 'SUSPENDED') {
    throw new Error('This account has been suspended by an administrator.');
  }
  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid email or password.');
  }
  const session = await createSession(user.id, {
    userAgent: input.userAgent,
    ipAddress: input.ipAddress,
  });
  return { user: sanitizeUser(user), token: session.token };
}

export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  keepSessionId?: string | null
): Promise<number> {
  const user = await dbGet<StoredUserRecord>('users', userId);
  if (!user) throw new Error('Account not found.');

  if (user.passwordHash) {
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new Error('Current password is incorrect.');
    }
  }

  const strengthErr = validatePasswordStrength(newPassword);
  if (strengthErr) {
    throw new Error(strengthErr);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await dbSet('users', user.id, {
    ...user,
    passwordHash,
    updatedAt: new Date().toISOString(),
  });

  return revokeOtherUserSessions(user.id, keepSessionId);
}

export async function verifyEmailByToken(token: string): Promise<UserProfile> {
  const users = await dbList<StoredUserRecord>('users', (u) => u.verificationToken === token);
  const user = users[0];
  if (!user) {
    throw new Error('Invalid or expired verification token.');
  }
  const updated = await dbSet('users', user.id, {
    ...user,
    emailVerified: true,
    verificationToken: null,
    updatedAt: new Date().toISOString(),
  });
  return sanitizeUser(updated);
}

export async function requestPasswordReset(email: string): Promise<{ resetToken: string | null }> {
  const user = await findUserByEmail(email);
  if (!user) {
    // Do not leak user existence
    return { resetToken: null };
  }
  const resetToken = crypto.randomBytes(24).toString('hex');
  const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await dbSet('users', user.id, {
    ...user,
    resetToken,
    resetTokenExpiresAt,
    updatedAt: new Date().toISOString(),
  });
  return { resetToken };
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<string> {
  const strengthErr = validatePasswordStrength(newPassword);
  if (strengthErr) {
    throw new Error(strengthErr);
  }
  const users = await dbList<StoredUserRecord>('users', (u) => u.resetToken === token);
  const user = users[0];
  if (!user || !user.resetTokenExpiresAt || new Date(user.resetTokenExpiresAt).getTime() < Date.now()) {
    throw new Error('Invalid or expired password reset token.');
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await dbSet('users', user.id, {
    ...user,
    passwordHash,
    resetToken: null,
    resetTokenExpiresAt: null,
    updatedAt: new Date().toISOString(),
  });
  await revokeOtherUserSessions(user.id, null);
  return user.email;
}
