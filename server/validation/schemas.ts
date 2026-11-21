import type { NextFunction, Request, Response } from 'express';
import { z, type ZodSchema } from 'zod';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const pathStr = firstIssue?.path?.length ? `${firstIssue.path.join('.')}: ` : '';
      return res.status(400).json({
        error: `${pathStr}${firstIssue?.message || 'Invalid request payload.'}`,
      });
    }
    req.body = parsed.data;
    next();
  };
}

export const authRegisterSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.').max(254),
  username: z.string().trim().min(2).max(32),
  password: z.string().min(8).max(128),
});

export const authLoginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.').max(254),
  password: z.string().min(1, 'Password is required.').max(128),
});

export const authProfilePatchSchema = z.object({
  username: z.string().trim().min(2).max(32).optional(),
  avatarUrl: z.string().trim().max(500).optional(),
  bio: z.string().max(500).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(128).optional().default(''),
  newPassword: z.string().min(8).max(128),
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(4).max(256),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(254),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(4).max(256),
  newPassword: z.string().min(8).max(128),
});

export const adminLoginSchema = z.object({
  password: z.string().min(1, 'Administrator password is required.').max(128),
});

export const watchlistUpsertSchema = z.object({
  anilistId: z.coerce.number().int().positive(),
  animeTitle: z.string().trim().min(1).max(300),
  animeSlug: z.string().trim().max(300).optional(),
  coverImage: z.string().trim().max(1000).nullable().optional(),
  totalEpisodes: z.coerce.number().int().nonnegative().nullable().optional(),
  status: z.enum(['WATCHING', 'COMPLETED', 'PLAN_TO_WATCH', 'DROPPED', 'ON_HOLD']).optional(),
  episodesWatched: z.coerce.number().int().nonnegative().max(10000).optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const favoriteToggleSchema = z.object({
  anilistId: z.coerce.number().int().positive(),
  animeTitle: z.string().trim().min(1).max(300),
  animeSlug: z.string().trim().max(300).optional(),
  coverImage: z.string().trim().max(1000).nullable().optional(),
});

export const watchHistorySchema = z.object({
  anilistId: z.coerce.number().int().positive(),
  animeTitle: z.string().trim().max(300).optional(),
  animeSlug: z.string().trim().max(300).optional(),
  coverImage: z.string().trim().max(1000).nullable().optional(),
  episodeNumber: z.coerce.number().nonnegative().max(10000).optional().default(1),
  providerKey: z.string().trim().max(64).optional().default('yenime'),
  language: z.enum(['sub', 'dub']).optional().default('sub'),
  progressSec: z.coerce.number().nonnegative().max(86400).optional().default(0),
  durationSec: z.coerce.number().nonnegative().max(86400).optional().default(0),
  completed: z.boolean().optional().default(false),
});

export const userRatingSchema = z.object({
  anilistId: z.coerce.number().int().positive(),
  score: z.coerce.number().min(1).max(10),
  review: z.string().max(2000).nullable().optional(),
});

export const reminderCreateSchema = z.object({
  anilistId: z.coerce.number().int().positive(),
  animeTitle: z.string().trim().min(1).max(300),
  animeSlug: z.string().trim().max(300).optional(),
  coverImage: z.string().trim().max(1000).nullable().optional(),
  airingAt: z.number().nullable().optional(),
  episode: z.number().nullable().optional(),
});

export const userCollectionCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(400).nullable().optional(),
  anilistIds: z.array(z.coerce.number().int().positive()).max(50).optional(),
  isPrivate: z.boolean().optional(),
});

export const userCollectionPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(400).nullable().optional(),
  anilistIds: z.array(z.coerce.number().int().positive()).max(50).optional(),
  addAnilistId: z.coerce.number().int().positive().optional(),
  removeAnilistId: z.coerce.number().int().positive().optional(),
  isPrivate: z.boolean().optional(),
});

export const userPreferencesPatchSchema = z.object({
  visualTheme: z.enum(['midnight-violet', 'obsidian', 'aurora', 'eclipse']).optional(),
  customAccentHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  compactMode: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
  personalizationEnabled: z.boolean().optional(),
  profilePublic: z.boolean().optional(),
  hideAchievements: z.boolean().optional(),
});

export const aiNaturalSearchSchema = z.object({
  query: z.string().trim().min(2).max(240),
});

export const aiMoodPickSchema = z.object({
  mood: z.string().trim().min(2).max(120),
  excludeGenres: z.array(z.string().max(40)).max(10).optional().default([]),
});

export const telemetryEventSchema = z.object({
  event: z.enum(['init_success', 'failover', 'error']),
  server: z.string().max(64).optional(),
  from: z.string().max(64).optional(),
  to: z.string().max(64).optional(),
  reason: z.string().max(300).optional(),
  anilistId: z.coerce.number().int().nonnegative().optional(),
  episode: z.coerce.number().nonnegative().optional(),
  latencyMs: z.number().nonnegative().max(120000).optional(),
});
