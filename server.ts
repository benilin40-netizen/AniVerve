import dotenv from 'dotenv';
dotenv.config({ override: true });
import crypto from 'node:crypto';
import compression from 'compression';
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
import aiRoutes from './server/api/aiRoutes.ts';
import { ensureDefaultSeedData, getDbHealth, logAppError } from './server/services/db.ts';
import { ensureAdminCredentialInitialized } from './server/services/adminAuthService.ts';
import { getSupabaseConfigStatus } from './server/services/supabaseClient.ts';
import { getCacheStats } from './server/services/cacheService.ts';
import { getHomeCollections } from './server/services/anilistService.ts';
import { injectHtmlMetadataAndNonce } from './server/services/ogService.ts';
import { startBackgroundJobs } from './server/jobs/refreshJobs.ts';
import { rateLimiters } from './server/middleware/rateLimit.ts';
import { cleanEnv } from './server/utils/env.ts';
import { captureTrackedError, logger } from './server/utils/logger.ts';
import { assertProductionEnvironment } from './server/utils/runtimeSecrets.ts';

function buildAllowedOrigins(): Set<string> {
  const allowed = new Set<string>();
  const appUrl = cleanEnv(process.env.APP_URL);
  if (appUrl && !appUrl.includes('MY_APP_URL')) {
    try {
      allowed.add(new URL(appUrl).origin);
    } catch {
      // ignore invalid URL
    }
  }
  const vercelUrl = cleanEnv(process.env.VERCEL_URL);
  if (vercelUrl) {
    allowed.add(`https://${vercelUrl.replace(/^https?:\/\//, '')}`);
  }
  if (process.env.NODE_ENV !== 'production') {
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:3000');
    allowed.add('http://0.0.0.0:3000');
  }
  return allowed;
}

function buildConnectSrcHosts(): string {
  const hosts = [
    "'self'",
    'https://graphql.anilist.co',
    'https://api.jikan.moe',
    'https://api.yenime.net',
    'https://aniembed.se',
    'https://*.supabase.co',
    'https://*.googleapis.com',
    'https://firebaseinstallations.googleapis.com',
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
  ];
  const supaUrl = cleanEnv(process.env.SUPABASE_URL) || cleanEnv(process.env.VITE_SUPABASE_URL);
  if (supaUrl) {
    try {
      hosts.push(new URL(supaUrl).origin);
    } catch {
      // ignore
    }
  }
  return Array.from(new Set(hosts)).join(' ');
}

export function createApp() {
  const app = express();
  const allowedOrigins = buildAllowedOrigins();
  const connectSrcDirective = buildConnectSrcHosts();
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', 1);
  app.use(compression());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} is not permitted by CORS policy.`));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '512kb' }));
  app.use(cookieParser());

  // Request correlation ID, structured timing logs & hardened security headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const requestId =
      typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].trim()
        ? req.headers['x-request-id'].trim().slice(0, 64)
        : crypto.randomUUID();
    const cspNonce = crypto.randomBytes(16).toString('base64');

    (req as Request & { requestId?: string }).requestId = requestId;
    res.locals.cspNonce = cspNonce;

    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-${cspNonce}' https://apis.google.com`,
        `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' https: data: blob:",
        "media-src 'self' https: blob:",
        `connect-src ${connectSrcDirective}`,
        "frame-src 'self' https://player.yenime.net https://aniembed.se https://megaplay.buzz https://play.vhscdn.to https://www.youtube-nocookie.com https://www.youtube.com https://www.dailymotion.com https://accounts.google.com https://*.firebaseapp.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    );

    res.on('finish', () => {
      if (req.path.startsWith('/api/') && req.path !== '/api/health') {
        logger.info('HTTP request completed', {
          requestId,
          method: req.method,
          route: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
        });
      }
    });

    next();
  });

  app.use('/api', rateLimiters.globalApi);

  // Health probe reads status without triggering DB writes/seeding
  app.get('/api/health', (_req, res) => {
    const dbHealth = getDbHealth();
    const cacheStats = getCacheStats();
    res.setHeader('Cache-Control', 'no-store');
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
  app.use('/api/ai', aiRoutes);
  app.get('/api/providers/status', async (_req, res) => {
    try {
      const payload = await buildProviderStatusPayload();
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json(payload);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load provider status.',
      });
    }
  });
  app.use('/api/user', userRoutes);
  app.use('/api/admin', rateLimiters.admin, adminAuthRoutes);
  app.use('/api/admin', rateLimiters.admin, adminRoutes);
  app.use('/', seoRoutes);

  // Return structured 404 for unknown API paths instead of falling through to SPA HTML
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Global Express error handler — logs server-side diagnostics, never leaks stack traces
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    void _next;
    const requestId = (req as Request & { requestId?: string }).requestId || null;
    const errStatus =
      typeof err === 'object' && err !== null && 'status' in err
        ? Number((err as { status?: unknown }).status)
        : undefined;
    const status = errStatus && Number.isInteger(errStatus) && errStatus >= 400 ? errStatus : 500;
    const isCorsErr = err instanceof Error && err.message.includes('CORS policy');
    const resolvedStatus = isCorsErr ? 403 : status;
    const rawMsg =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message?: unknown }).message)
          : '';
    const message =
      resolvedStatus < 500 && rawMsg ? rawMsg : 'An unexpected server error occurred.';

    captureTrackedError(err, { requestId, route: req.originalUrl, statusCode: resolvedStatus });
    logger.error('Express error handler', {
      requestId,
      route: req.originalUrl,
      statusCode: resolvedStatus,
      error: err instanceof Error ? err.message : String(err || 'Server error'),
    });

    void logAppError({
      requestId,
      source: 'express',
      route: req.originalUrl,
      statusCode: resolvedStatus,
      message: err instanceof Error ? err.message : String(err || 'Server error'),
    });

    if (!res.headersSent) {
      res.status(resolvedStatus).json({ error: message, requestId });
    }
  });

  return app;
}

const app = createApp();
const isVercel = Boolean(process.env.VERCEL);

async function startServer() {
  assertProductionEnvironment();
  await ensureDefaultSeedData();
  await ensureAdminCredentialInitialized();
  startBackgroundJobs();

  // Warm home cache asynchronously so initial visitors hit fast warm catalog data
  void getHomeCollections().catch(() => {});

  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'custom',
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

    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api/') || req.method !== 'GET') return next();
      try {
        const rawHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        const nonce = String(res.locals.cspNonce || '');
        const finalHtml = await injectHtmlMetadataAndNonce(transformed, req, nonce);
        res.status(200).setHeader('Content-Type', 'text/html').send(finalHtml);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(
        express.static(distDir, {
          index: false,
          maxAge: '7d',
          setHeaders(res, filePath) {
            if (filePath.includes('/assets/')) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
          },
        })
      );
      const distHtmlPath = path.join(distDir, 'index.html');
      const cachedDistHtml = fs.existsSync(distHtmlPath) ? fs.readFileSync(distHtmlPath, 'utf-8') : '';

      app.get('*', async (req, res) => {
        const nonce = String(res.locals.cspNonce || '');
        if (!cachedDistHtml) {
          return res.status(404).send('Application bundle missing.');
        }
        const finalHtml = await injectHtmlMetadataAndNonce(cachedDistHtml, req, nonce);
        res.status(200).setHeader('Content-Type', 'text/html').send(finalHtml);
      });
    }
  }

  app.listen(port, '0.0.0.0', () => {
    logger.info(`AniVerve server listening on http://0.0.0.0:${port}`);
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
