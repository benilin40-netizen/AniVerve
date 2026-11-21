import { Router, type Request, type Response } from 'express';
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
import {
  clearUserSessionCookies,
  issueUserCsrfCookie,
  requireAuth,
  requireUserCsrf,
  type AuthenticatedRequest,
} from '../middleware/authMiddleware.ts';
import { rateLimiters } from '../middleware/rateLimit.ts';
import {
  authLoginSchema,
  authProfilePatchSchema,
  authRegisterSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  validateBody,
  verifyEmailSchema,
} from '../validation/schemas.ts';
import type { SystemSettings } from '../../src/types/anime.ts';

const router = Router();

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
  issueUserCsrfCookie(res);
}

function getClientMeta(req: Request) {
  return {
    userAgent: req.headers['user-agent'] || null,
    ipAddress: req.ip || req.socket.remoteAddress || null,
  };
}

router.post(
  '/register',
  rateLimiters.auth,
  validateBody(authRegisterSchema),
  async (req, res) => {
    const meta = getClientMeta(req);
    try {
      await ensureDefaultSeedData();
      const settings = await dbGet<SystemSettings>('system_settings', 'global');
      if (settings && settings.allowRegistration === false) {
        return res
          .status(403)
          .json({ error: 'New user registrations are currently disabled by an administrator.' });
      }

      const { email, username, password } = req.body;
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
  }
);

router.post(
  '/login',
  rateLimiters.auth,
  validateBody(authLoginSchema),
  async (req, res) => {
    const meta = getClientMeta(req);
    try {
      const { email, password } = req.body;
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
      const message = err instanceof Error ? err.message : 'Login failed.';
      await logSecurityEvent({
        email: typeof req.body?.email === 'string' ? req.body.email : null,
        event: 'LOGIN_FAILED',
        success: false,
        ipAddress: meta.ipAddress,
        details: message,
      });
      const status = message.toLowerCase().includes('too many') || message.toLowerCase().includes('locked') ? 429 : 401;
      res.status(status).json({ error: message });
    }
  }
);

router.post('/admin-login', (_req, res) => {
  res.status(410).json({ error: 'Use /api/admin/login for administrator authentication.' });
});

router.post('/firebase', (_req, res) => {
  res.status(410).json({ error: 'Firebase token exchange has been disabled.' });
});

router.post('/logout', requireUserCsrf, async (req: AuthenticatedRequest, res) => {
  const token = req.authToken || req.cookies?.aniverve_session;
  if (token) {
    await revokeSession(token);
  }
  clearUserSessionCookies(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  const existingCsrf = (req as any).cookies?.aniverve_user_csrf;
  issueUserCsrfCookie(res, typeof existingCsrf === 'string' ? existingCsrf : undefined);
  const allUsers = await dbList<StoredUserRecord>('users');
  const hasAdmin = allUsers.some((u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN');
  res.json({ user: sanitizeUser(req.authUser!), hasAdmin });
});

router.get('/sessions', requireAuth, async (req: AuthenticatedRequest, res) => {
  const currentSid = getSessionIdFromToken(req.authToken);
  const sessions = await listUserSessions(req.authUser!.id, currentSid);
  res.json({ sessions });
});

router.delete('/sessions/:sessionId', requireAuth, requireUserCsrf, async (req: AuthenticatedRequest, res) => {
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
    clearUserSessionCookies(res);
  }
  res.json({ ok: true, currentRevoked: Boolean(currentSid && targetSid === currentSid) });
});

router.post(
  '/change-password',
  requireAuth,
  requireUserCsrf,
  rateLimiters.auth,
  validateBody(changePasswordSchema),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
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

router.patch(
  '/profile',
  requireAuth,
  requireUserCsrf,
  validateBody(authProfilePatchSchema),
  async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.authUser!;
      const { username, avatarUrl, bio } = req.body;
      const updates: Partial<StoredUserRecord> = {
        updatedAt: new Date().toISOString(),
      };

      if (typeof username === 'string') {
        const trimmed = username.trim();
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
  }
);

router.post(
  '/verify-email',
  rateLimiters.auth,
  validateBody(verifyEmailSchema),
  async (req, res) => {
    try {
      const { token } = req.body;
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
  rateLimiters.auth,
  validateBody(forgotPasswordSchema),
  async (req, res) => {
    try {
      const { email } = req.body;
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
  rateLimiters.auth,
  validateBody(resetPasswordSchema),
  async (req, res) => {
    try {
      const { token, newPassword } = req.body;
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
