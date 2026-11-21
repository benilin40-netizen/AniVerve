import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import {
  changeAdminPassword,
  getAdminSessionStatus,
  revokeAdminSession,
  verifyAdminPasswordAndCreateSession,
} from '../services/adminAuthService.ts';
import {
  clearAdminSessionCookies,
  extractAdminSessionToken,
  requireIndependentAdminSession,
  setAdminSessionCookies,
  type AdminAuthenticatedRequest,
} from '../middleware/adminAuthMiddleware.ts';
import { dbSet, logSecurityEvent } from '../services/db.ts';

const router = Router();

function getClientMeta(req: Request) {
  return {
    ipAddress: req.ip || req.socket.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null,
  };
}

router.post('/login', async (req, res) => {
  const meta = getClientMeta(req);
  try {
    const { password } = req.body || {};
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Administrator password is required.' });
    }

    const result = await verifyAdminPasswordAndCreateSession({
      password,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    setAdminSessionCookies(res, result.token, result.csrfToken);

    const logId = crypto.randomUUID();
    await dbSet('admin_activity', logId, {
      id: logId,
      adminId: result.session.id,
      adminEmail: 'admin-console',
      action: 'ADMIN_LOGIN',
      target: 'backend-password-gate',
      details: { ipAddress: meta.ipAddress },
      createdAt: new Date().toISOString(),
    });

    await logSecurityEvent({
      userId: result.session.id,
      email: 'admin-console',
      event: 'ADMIN_SIGN_IN',
      success: true,
      ipAddress: meta.ipAddress,
    });

    res.json({
      authenticated: true,
      mustChangePassword: Boolean(result.credential.mustChangePassword),
      sessionId: result.session.id,
      expiresAt: result.session.expiresAt,
      csrfToken: result.csrfToken,
      usingEnvPassword: result.credential.usingEnvPassword,
      authMode: 'backend-password',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Administrator authentication failed.';
    await logSecurityEvent({
      email: 'admin-console',
      event: 'ADMIN_SIGN_IN_FAILED',
      success: false,
      ipAddress: meta.ipAddress,
      details: message,
    });
    const status = message.toLowerCase().includes('too many') || message.toLowerCase().includes('locked') ? 429 : 401;
    res.status(status).json({ error: message });
  }
});

router.post('/logout', async (req, res) => {
  const token = extractAdminSessionToken(req);
  if (token) {
    await revokeAdminSession(token);
  }
  clearAdminSessionCookies(res);
  await logSecurityEvent({
    email: 'admin-console',
    event: 'ADMIN_LOGOUT',
    success: true,
    ipAddress: req.ip || req.socket.remoteAddress || null,
  });
  res.json({ ok: true, authenticated: false });
});

router.get('/session', async (req, res) => {
  const token = extractAdminSessionToken(req);
  const status = await getAdminSessionStatus(token);
  if (status.authenticated && status.csrfToken && token) {
    setAdminSessionCookies(res, token, status.csrfToken);
  }
  res.json(status);
});

router.post('/change-password', requireIndependentAdminSession, async (req: AdminAuthenticatedRequest, res) => {
  const meta = getClientMeta(req);
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || typeof currentPassword !== 'string') {
      return res.status(400).json({ error: 'Current administrator password is required.' });
    }
    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'New administrator password is required.' });
    }

    const rotated = await changeAdminPassword({
      currentPassword,
      newPassword,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    setAdminSessionCookies(res, rotated.token, rotated.csrfToken);

    const logId = crypto.randomUUID();
    await dbSet('admin_activity', logId, {
      id: logId,
      adminId: rotated.session.id,
      adminEmail: 'admin-console',
      action: 'ADMIN_PASSWORD_CHANGED',
      target: 'admin_credentials',
      details: { revokedSessions: rotated.revokedSessions },
      createdAt: new Date().toISOString(),
    });

    await logSecurityEvent({
      userId: rotated.session.id,
      email: 'admin-console',
      event: 'ADMIN_PASSWORD_CHANGED',
      success: true,
      ipAddress: meta.ipAddress,
      details: `Invalidated ${rotated.revokedSessions} previous admin session(s)`,
    });

    res.json({
      ok: true,
      mustChangePassword: false,
      sessionId: rotated.session.id,
      expiresAt: rotated.session.expiresAt,
      csrfToken: rotated.csrfToken,
      revokedSessions: rotated.revokedSessions,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Unable to change administrator password.',
    });
  }
});

export default router;
