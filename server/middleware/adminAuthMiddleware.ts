import type { NextFunction, Request, Response } from 'express';
import {
  timingSafeEqualStrings,
  verifyAdminSessionToken,
  type AdminCredentialRecord,
  type AdminSessionRecord,
} from '../services/adminAuthService.ts';

export const ADMIN_SESSION_COOKIE = 'aniverve_admin_session';
export const ADMIN_CSRF_COOKIE = 'aniverve_admin_csrf';

export interface AdminAuthenticatedRequest extends Request {
  adminSession?: AdminSessionRecord;
  adminCredential?: AdminCredentialRecord;
  adminActor?: { id: string; email: string };
}

export function extractAdminSessionToken(req: Request): string | null {
  const cookieToken = (req as any).cookies?.[ADMIN_SESSION_COOKIE];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }
  return null;
}

export function setAdminSessionCookies(res: Response, token: string, csrfToken: string) {
  const isProd =
    process.env.NODE_ENV === 'production' || Boolean(process.env.APP_URL?.startsWith('https://'));
  const maxAge = 8 * 60 * 60 * 1000;

  res.cookie(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge,
    path: '/',
  });

  res.cookie(ADMIN_CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge,
    path: '/',
  });
}

export function clearAdminSessionCookies(res: Response) {
  res.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });
  res.clearCookie(ADMIN_CSRF_COOKIE, { path: '/' });
}

export async function requireIndependentAdminSession(
  req: AdminAuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const token = extractAdminSessionToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Administrator session required.' });
  }

  const verified = await verifyAdminSessionToken(token);
  if (!verified) {
    clearAdminSessionCookies(res);
    return res.status(401).json({ error: 'Administrator session expired or invalid.' });
  }

  // Enforce CSRF token validation on all state-mutating admin requests
  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const headerCsrf =
      typeof req.headers['x-csrf-token'] === 'string' ? req.headers['x-csrf-token'].trim() : '';
    const cookieCsrf =
      typeof (req as any).cookies?.[ADMIN_CSRF_COOKIE] === 'string'
        ? (req as any).cookies[ADMIN_CSRF_COOKIE]
        : '';

    const csrfValid =
      headerCsrf.length > 0 &&
      timingSafeEqualStrings(headerCsrf, verified.session.csrfToken) &&
      (!cookieCsrf || timingSafeEqualStrings(cookieCsrf, verified.session.csrfToken));

    if (!csrfValid) {
      return res.status(403).json({
        error: 'Security verification failed (CSRF token missing or invalid). Reload the admin console.',
      });
    }
  }

  req.adminSession = verified.session;
  req.adminCredential = verified.credential;
  req.adminActor = {
    id: `admin_session:${verified.session.id}`,
    email: 'admin-console',
  };
  next();
}
