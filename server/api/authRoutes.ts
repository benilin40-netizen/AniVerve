import crypto from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  changeUserPassword,
  getSessionIdFromToken,
  listUserSessions,
  loginEmailUser,
  registerEmailUser,
  requestPasswordReset,
  resetPasswordWithToken,
  revokeOtherUserSessions,
  revokeSession,
  revokeSessionById,
  sanitizeUser,
  verifyEmailByToken,
  type StoredUserRecord,
} from '../services/authService.ts';
import { dbGet, dbList, dbSet, ensureDefaultSeedData, logSecurityEvent } from '../services/db.ts';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import type { SystemSettings } from '../../src/types/anime.ts';

const router = Router();

// Sliding-window in-memory rate limiter for authentication endpoints
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function createRateLimiter(bucketName: string, maxAttempts: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${bucketName}:${ip}`;
    const now = Date.now();
    const entry = rateBuckets.get(key);

    if (entry && now < entry.resetAt) {
      if (entry.count >= maxAttempts) {
        const retrySec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
        res.setHeader('Retry-After', String(retrySec));
        return res.status(429).json({
          error: `Too many requests. Please wait ${retrySec} seconds before trying again.`,
        });
      }
      entry.count += 1;
    } else {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    }

    if (rateBuckets.size > 2000) {
      for (const [k, v] of rateBuckets.entries()) {
        if (now >= v.resetAt) rateBuckets.delete(k);
      }
    }
    next();
  };
}

function setSessionCookie(res: Response, token: string) {
  const isProd =
    process.env.NODE_ENV === 'production' || Boolean(process.env.APP_URL?.startsWith('https://'));
  res.cookie('aniverve_session', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function getClientMeta(req: Request) {
  return {
    userAgent: req.headers['user-agent'] || null,
    ipAddress: req.ip || req.socket.remoteAddress || null,
  };
}

router.post('/register', createRateLimiter('register', 10, 15 * 60 * 1000), async (req, res) => {
  const meta = getClientMeta(req);
  try {
    await ensureDefaultSeedData();
    const settings = await dbGet<SystemSettings>('system_settings', 'global');
    if (settings && settings.allowRegistration === false) {
      return res
        .status(403)
        .json({ error: 'New user registrations are currently disabled by an administrator.' });
    }

    const { email, username, password } = req.body || {};
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required.' });
    }

    const result = await registerEmailUser({
      email,
      username,
      password,
      ...meta,
    });
    setSessionCookie(res, result.token);
    await logSecurityEvent({
      userId: result.user.id,
      email: result.user.email,
      event: 'USER_REGISTER',
      success: true,
      ipAddress: meta.ipAddress,
    });

    res.status(201).json({
      user: result.user,
      token: result.token,
      verificationPending: true,
      verificationToken: process.env.SMTP_HOST ? undefined : result.verificationToken,
    });
  } catch (err) {
    await logSecurityEvent({
      email: typeof req.body?.email === 'string' ? req.body.email : null,
      event: 'USER_REGISTER_FAILED',
      success: false,
      ipAddress: meta.ipAddress,
      details: err instanceof Error ? err.message : 'Registration error',
    });
    res.status(400).json({ error: err instanceof Error ? err.message : 'Registration failed.' });
  }
});

router.post('/login', createRateLimiter('login', 15, 10 * 60 * 1000), async (req, res) => {
  const meta = getClientMeta(req);
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const result = await loginEmailUser({ email, password, ...meta });
    setSessionCookie(res, result.token);
    await logSecurityEvent({
      userId: result.user.id,
      email: result.user.email,
      event: 'LOGIN_SUCCESS',
      success: true,
      ipAddress: meta.ipAddress,
    });
    res.json(result);
  } catch (err) {
    await logSecurityEvent({
      email: typeof req.body?.email === 'string' ? req.body.email : null,
      event: 'LOGIN_FAILED',
      success: false,
      ipAddress: meta.ipAddress,
      details: err instanceof Error ? err.message : 'Login failed',
    });
    res.status(401).json({ error: err instanceof Error ? err.message : 'Login failed.' });
  }
});

router.post('/admin-login', (_req, res) => {
  res.status(410).json({ error: 'Use /api/admin/login for administrator authentication.' });
});

router.post('/firebase', (_req, res) => {
  res.status(410).json({ error: 'Firebase token exchange has been disabled.' });
});

router.post('/logout', async (req: AuthenticatedRequest, res) => {
  const token = req.authToken || req.cookies?.aniverve_session;
  if (token) {
    await revokeSession(token);
  }
  res.clearCookie('aniverve_session', { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  const allUsers = await dbList<StoredUserRecord>('users');
  const hasAdmin = allUsers.some((u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN');
  res.json({ user: sanitizeUser(req.authUser!), hasAdmin });
});

router.get('/sessions', requireAuth, async (req: AuthenticatedRequest, res) => {
  const currentSid = getSessionIdFromToken(req.authToken);
  const sessions = await listUserSessions(req.authUser!.id, currentSid);
  res.json({ sessions });
});

router.delete('/sessions/:sessionId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const currentSid = getSessionIdFromToken(req.authToken);
  const targetSid = req.params.sessionId;

  if (targetSid === 'others') {
    const revokedCount = await revokeOtherUserSessions(req.authUser!.id, currentSid);
    await logSecurityEvent({
      userId: req.authUser!.id,
      email: req.authUser!.email,
      event: 'OTHER_SESSIONS_REVOKED',
      success: true,
      ipAddress: req.ip || null,
      details: `Revoked ${revokedCount} session(s)`,
    });
    return res.json({ ok: true, revokedCount });
  }

  const ok = await revokeSessionById(req.authUser!.id, targetSid);
  if (!ok) {
    return res.status(404).json({ error: 'Session not found.' });
  }
  await logSecurityEvent({
    userId: req.authUser!.id,
    email: req.authUser!.email,
    event: 'SESSION_REVOKED',
    success: true,
    ipAddress: req.ip || null,
    details: targetSid,
  });
  if (currentSid && targetSid === currentSid) {
    res.clearCookie('aniverve_session', { path: '/' });
  }
  res.json({ ok: true, currentRevoked: Boolean(currentSid && targetSid === currentSid) });
});

router.post(
  '/change-password',
  requireAuth,
  createRateLimiter('change-password', 8, 15 * 60 * 1000),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      if (!newPassword || typeof newPassword !== 'string') {
        return res.status(400).json({ error: 'New password is required.' });
      }
      const currentSid = getSessionIdFromToken(req.authToken);
      const revokedOthers = await changeUserPassword(
        req.authUser!.id,
        String(currentPassword || ''),
        newPassword,
        currentSid
      );
      await logSecurityEvent({
        userId: req.authUser!.id,
        email: req.authUser!.email,
        event: 'PASSWORD_CHANGED',
        success: true,
        ipAddress: req.ip || null,
        details: `Revoked ${revokedOthers} other session(s)`,
      });
      res.json({ ok: true, revokedOtherSessions: revokedOthers });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to update password.',
      });
    }
  }
);

router.patch('/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.authUser!;
    const { username, avatarUrl, bio } = req.body || {};
    const updates: Partial<StoredUserRecord> = {
      updatedAt: new Date().toISOString(),
    };

    if (typeof username === 'string') {
      const trimmed = username.trim();
      if (trimmed.length < 2 || trimmed.length > 32) {
        return res.status(400).json({ error: 'Username must be between 2 and 32 characters.' });
      }
      const existing = await dbList<StoredUserRecord>(
        'users',
        (u) => u.username.toLowerCase() === trimmed.toLowerCase() && u.id !== user.id
      );
      if (existing.length > 0) {
        return res.status(400).json({ error: 'Username is already taken.' });
      }
      updates.username = trimmed;
    }

    if (typeof avatarUrl === 'string') {
      const clean = avatarUrl.trim();
      if (clean && !clean.startsWith('https://') && !clean.startsWith('/')) {
        return res.status(400).json({ error: 'Avatar URL must use HTTPS.' });
      }
      updates.avatarUrl = clean || null;
    }

    if (typeof bio === 'string') {
      updates.bio = bio.trim().slice(0, 500);
    }

    const updated = await dbSet('users', user.id, { ...user, ...updates });
    res.json({ user: sanitizeUser(updated) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update profile.' });
  }
});

router.post(
  '/verify-email',
  createRateLimiter('verify-email', 15, 15 * 60 * 1000),
  async (req, res) => {
    try {
      const { token } = req.body || {};
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Verification token is required.' });
      }
      const user = await verifyEmailByToken(token);
      await logSecurityEvent({
        userId: user.id,
        email: user.email,
        event: 'EMAIL_VERIFIED',
        success: true,
        ipAddress: req.ip || null,
      });
      res.json({ user, verified: true });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Email verification failed.',
      });
    }
  }
);

router.post(
  '/forgot-password',
  createRateLimiter('forgot-password', 8, 15 * 60 * 1000),
  async (req, res) => {
    try {
      const { email } = req.body || {};
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required.' });
      }
      const { resetToken } = await requestPasswordReset(email);
      await logSecurityEvent({
        email: email.trim().toLowerCase(),
        event: 'PASSWORD_RESET_REQUESTED',
        success: true,
        ipAddress: req.ip || null,
      });
      res.json({
        ok: true,
        message: 'If an account matches that email, a password reset link has been generated.',
        resetToken: process.env.SMTP_HOST ? undefined : resetToken,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to process reset request.',
      });
    }
  }
);

router.post(
  '/reset-password',
  createRateLimiter('reset-password', 10, 15 * 60 * 1000),
  async (req, res) => {
    try {
      const { token, newPassword } = req.body || {};
      if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token and new password are required.' });
      }
      const email = await resetPasswordWithToken(token, newPassword);
      await logSecurityEvent({
        email,
        event: 'PASSWORD_RESET_COMPLETED',
        success: true,
        ipAddress: req.ip || null,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Password reset failed.',
      });
    }
  }
);

router.post('/bootstrap-admin', (_req, res) => {
  res.status(410).json({ error: 'Admin bootstrap via user account has been removed. Use /api/admin/login.' });
});

export default router;
