import type { NextFunction, Request, Response } from 'express';
import { verifySessionToken, type StoredUserRecord } from '../services/authService.ts';
import { extractAdminSessionToken } from './adminAuthMiddleware.ts';
import { verifyAdminSessionToken } from '../services/adminAuthService.ts';

export interface AuthenticatedRequest extends Request {
  authUser?: StoredUserRecord;
  authToken?: string;
}

export function buildAdministratorUserRecord(createdAt?: string): StoredUserRecord {
  const now = new Date().toISOString();
  return {
    id: 'administrator',
    email: 'administrator@aniverve.local',
    username: 'Administrator',
    passwordHash: null,
    avatarUrl: null,
    bio: 'AniVerve Platform Administrator',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
    emailVerified: true,
    createdAt: createdAt || now,
    updatedAt: now,
  };
}

export function extractAuthToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieToken = (req as any).cookies?.aniverve_session;
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }
  return null;
}

async function resolveMemberOrAdminAuth(
  req: Request
): Promise<{ user: StoredUserRecord; token: string } | null> {
  const memberToken = extractAuthToken(req);
  if (memberToken) {
    const memberUser = await verifySessionToken(memberToken);
    if (memberUser) {
      return { user: memberUser, token: memberToken };
    }
  }

  const adminToken = extractAdminSessionToken(req);
  if (adminToken) {
    const adminVerified = await verifyAdminSessionToken(adminToken);
    if (adminVerified) {
      return {
        user: buildAdministratorUserRecord(adminVerified.credential.createdAt),
        token: adminToken,
      };
    }
  }

  return null;
}

export async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  const resolved = await resolveMemberOrAdminAuth(req);
  if (resolved && resolved.user.status !== 'SUSPENDED') {
    req.authUser = resolved.user;
    req.authToken = resolved.token;
  }
  next();
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const resolved = await resolveMemberOrAdminAuth(req);
  if (!resolved) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (resolved.user.status === 'SUSPENDED') {
    return res.status(403).json({ error: 'Account is suspended.' });
  }
  req.authUser = resolved.user;
  req.authToken = resolved.token;
  next();
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.authUser.role !== 'ADMIN' && req.authUser.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Administrator privileges required.' });
  }
  next();
}

export function requireSuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.authUser.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Super Administrator privileges required.' });
  }
  next();
}
