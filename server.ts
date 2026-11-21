import dotenv from 'dotenv';
dotenv.config({ override: true });
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import authRoutes from './server/api/authRoutes.ts';
import animeRoutes from './server/api/animeRoutes.ts';
import streamingRoutes, { buildProviderStatusPayload } from './server/api/streamingRoutes.ts';
import userRoutes from './server/api/userRoutes.ts';
import adminAuthRoutes from './server/api/adminAuthRoutes.ts';
import adminRoutes from './server/api/adminRoutes.ts';
import seoRoutes from './server/api/seoRoutes.ts';
import { ensureDefaultSeedData, getDbHealth, logAppError } from './server/services/db.ts';
import { ensureAdminCredentialInitialized } from './server/services/adminAuthService.ts';
import { getSupabaseConfigStatus } from './server/services/supabaseClient.ts';
import { getCacheStats } from './server/services/cacheService.ts';
import { startBackgroundJobs } from './server/jobs/refreshJobs.ts';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Request correlation ID & production security headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId =
      typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].trim()
        ? req.headers['x-request-id'].trim().slice(0, 64)
        : crypto.randomUUID();
    (req as any).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' https: data: blob:",
        "media-src 'self' https: blob:",
        "connect-src 'self' https:",
        "frame-src 'self' https://player.yenime.net https://aniembed.se https://megaplay.buzz https://www.youtube-nocookie.com https://www.youtube.com https://www.dailymotion.com https://accounts.google.com https://*.firebaseapp.com",
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; ')
    );
    next();
  });

  app.get('/api/health', async (_req, res) => {
    await ensureDefaultSeedData();
    const dbHealth = getDbHealth();
    const cacheStats = getCacheStats();
    res.json({
      ok: true,
      environment: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.floor(process.uptime()),
      db: dbHealth,
      supabase: getSupabaseConfigStatus(),
      upstreamMetrics: cacheStats.metrics,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/anime', animeRoutes);
  app.use('/api/streaming', streamingRoutes);
  app.get('/api/providers/status', async (_req, res) => {
    try {
      const payload = await buildProviderStatusPayload();
      res.json(payload);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load provider status.',
      });
    }
  });
  app.use('/api/user', userRoutes);
  app.use('/api/admin', adminAuthRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/', seoRoutes);

  // Return structured 404 for unknown API paths instead of falling through to SPA HTML
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Global Express error handler — logs server-side diagnostics, never leaks stack traces
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const requestId = (req as any).requestId || null;
    const status = Number.isInteger(err?.status) && err.status >= 400 ? err.status : 500;
    const message =
      status < 500 && err?.message ? String(err.message) : 'An unexpected server error occurred.';

    void logAppError({
      requestId,
      source: 'express',
      route: req.originalUrl,
      statusCode: status,
      message: err instanceof Error ? err.message : String(err || 'Server error'),
    });

    if (!res.headersSent) {
      res.status(status).json({ error: message, requestId });
    }
  });

  return app;
}

const app = createApp();

const isVercel = Boolean(process.env.VERCEL);

async function startServer() {
  await ensureDefaultSeedData();
  await ensureAdminCredentialInitialized();
  startBackgroundJobs();

  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    const neutralizeViteClientWs = (rawCode: string): string => {
      return rawCode
        .replace(/transport\.connect\([^;]*createHMRHandler[^;]*\);?/g, '/* HMR WebSocket disabled */')
        .replace(
          /createConnection:\s*\(\)\s*=>\s*new WebSocket\([^)]*\)/g,
          'createConnection: () => ({ addEventListener() {}, removeEventListener() {}, close() {}, send() {}, readyState: 3 })'
        )
        .replace(
          /const socket = new WebSocket\(socketUrl,\s*["']vite-ping["']\);/g,
          'return false;'
        );
    };
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (!result) return next();
        const code = neutralizeViteClientWs(result.code);
        res.type('application/javascript').setHeader('Cache-Control', 'no-store').send(code);
      } catch {
        next();
      }
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`AniVerve server listening on http://0.0.0.0:${port}`);
  });
}

const isTestRunner =
  Boolean(process.env.NODE_TEST_CONTEXT) ||
  process.argv.some((arg) => arg === '--test' || arg.startsWith('--test-'));

if (!isVercel && !isTestRunner) {
  startServer().catch((err) => {
    console.error('Server startup error:', err);
    process.exit(1);
  });
}

export default app;
