-- AniVerve PostgreSQL Schema Migration (0001_init)
-- Preserves relational integrity with foreign keys, unique constraints, and operational indexes.

CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "WatchStatus" AS ENUM ('WATCHING', 'COMPLETED', 'PLAN_TO_WATCH', 'DROPPED', 'ON_HOLD');

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "username" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT,
  "avatarUrl" TEXT,
  "bio" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  "verificationToken" TEXT,
  "resetToken" TEXT,
  "resetTokenExpiresAt" TIMESTAMP(3),
  "firebaseUid" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_status_idx" ON "User"("status");

CREATE TABLE "Session" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE TABLE "Anime" (
  "id" SERIAL PRIMARY KEY,
  "anilistId" INTEGER NOT NULL UNIQUE,
  "malId" INTEGER UNIQUE,
  "slug" TEXT NOT NULL UNIQUE,
  "titleRomaji" TEXT NOT NULL,
  "titleEnglish" TEXT,
  "titleNative" TEXT,
  "format" TEXT,
  "status" TEXT,
  "season" TEXT,
  "seasonYear" INTEGER,
  "episodes" INTEGER,
  "duration" INTEGER,
  "coverImage" TEXT,
  "bannerImage" TEXT,
  "anilistScore" INTEGER,
  "malScore" DOUBLE PRECISION,
  "malRank" INTEGER,
  "featured" BOOLEAN NOT NULL DEFAULT FALSE,
  "hidden" BOOLEAN NOT NULL DEFAULT FALSE,
  "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Anime_anilistId_idx" ON "Anime"("anilistId");
CREATE INDEX "Anime_malId_idx" ON "Anime"("malId");
CREATE INDEX "Anime_featured_idx" ON "Anime"("featured");
CREATE INDEX "Anime_seasonYear_season_idx" ON "Anime"("seasonYear", "season");

CREATE TABLE "AnimeMetadata" (
  "id" TEXT PRIMARY KEY,
  "animeId" INTEGER NOT NULL UNIQUE REFERENCES "Anime"("id") ON DELETE CASCADE,
  "description" TEXT,
  "genres" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "studios" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "trailerId" TEXT,
  "trailerSite" TEXT,
  "charactersJson" JSONB,
  "staffJson" JSONB,
  "relationsJson" JSONB,
  "recommendations" JSONB,
  "malInfoJson" JSONB,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AnimeProvider" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'primary',
  "adapterType" TEXT NOT NULL,
  "baseUrl" TEXT,
  "urlTemplate" TEXT NOT NULL,
  "supportedIdTypes" TEXT[] NOT NULL DEFAULT ARRAY['anilist']::TEXT[],
  "supportedLanguages" TEXT[] NOT NULL DEFAULT ARRAY['sub', 'dub']::TEXT[],
  "isEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "licenseVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  "embeddingAllowed" BOOLEAN,
  "availabilityStatus" TEXT NOT NULL DEFAULT 'unverified',
  "verificationNotes" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "lastHttpStatus" INTEGER,
  "lastSuccessAt" TIMESTAMP(3),
  "priority" INTEGER NOT NULL DEFAULT 1,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "lastCheckedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AnimeProvider_isEnabled_priority_idx" ON "AnimeProvider"("isEnabled", "priority");

CREATE TABLE "Episode" (
  "id" TEXT PRIMARY KEY,
  "animeId" INTEGER NOT NULL REFERENCES "Anime"("id") ON DELETE CASCADE,
  "number" INTEGER NOT NULL,
  "title" TEXT,
  "thumbnail" TEXT,
  "airingAt" TIMESTAMP(3),
  "durationSec" INTEGER,
  CONSTRAINT "Episode_animeId_number_key" UNIQUE ("animeId", "number")
);
CREATE INDEX "Episode_animeId_idx" ON "Episode"("animeId");

CREATE TABLE "Watchlist" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "animeId" INTEGER REFERENCES "Anime"("id") ON DELETE SET NULL,
  "anilistId" INTEGER NOT NULL,
  "animeTitle" TEXT NOT NULL,
  "animeSlug" TEXT NOT NULL,
  "coverImage" TEXT,
  "totalEpisodes" INTEGER,
  "status" "WatchStatus" NOT NULL DEFAULT 'PLAN_TO_WATCH',
  "episodesWatched" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Watchlist_userId_anilistId_key" UNIQUE ("userId", "anilistId")
);
CREATE INDEX "Watchlist_userId_status_idx" ON "Watchlist"("userId", "status");

CREATE TABLE "Favorite" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "animeId" INTEGER REFERENCES "Anime"("id") ON DELETE SET NULL,
  "anilistId" INTEGER NOT NULL,
  "animeTitle" TEXT NOT NULL,
  "animeSlug" TEXT NOT NULL,
  "coverImage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Favorite_userId_anilistId_key" UNIQUE ("userId", "anilistId")
);
CREATE INDEX "Favorite_userId_idx" ON "Favorite"("userId");

CREATE TABLE "WatchHistory" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "animeId" INTEGER REFERENCES "Anime"("id") ON DELETE SET NULL,
  "anilistId" INTEGER NOT NULL,
  "animeTitle" TEXT NOT NULL,
  "animeSlug" TEXT NOT NULL,
  "coverImage" TEXT,
  "episodeNumber" INTEGER NOT NULL,
  "providerKey" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'sub',
  "progressSec" INTEGER NOT NULL DEFAULT 0,
  "durationSec" INTEGER NOT NULL DEFAULT 0,
  "completed" BOOLEAN NOT NULL DEFAULT FALSE,
  "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WatchHistory_userId_anilistId_episode_key" UNIQUE ("userId", "anilistId", "episodeNumber")
);
CREATE INDEX "WatchHistory_userId_watchedAt_idx" ON "WatchHistory"("userId", "watchedAt");

CREATE TABLE "AiringSchedule" (
  "id" TEXT PRIMARY KEY,
  "anilistId" INTEGER NOT NULL,
  "animeId" INTEGER REFERENCES "Anime"("id") ON DELETE SET NULL,
  "episode" INTEGER NOT NULL,
  "airingAt" TIMESTAMP(3) NOT NULL,
  "timeUntil" INTEGER,
  "title" TEXT NOT NULL,
  "coverImage" TEXT,
  "format" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiringSchedule_anilistId_episode_key" UNIQUE ("anilistId", "episode")
);
CREATE INDEX "AiringSchedule_airingAt_idx" ON "AiringSchedule"("airingAt");

CREATE TABLE "AdminActivity" (
  "id" TEXT PRIMARY KEY,
  "adminId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "action" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AdminActivity_adminId_createdAt_idx" ON "AdminActivity"("adminId", "createdAt");
CREATE INDEX "AdminActivity_createdAt_idx" ON "AdminActivity"("createdAt");

CREATE TABLE "SecurityAuditLog" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "email" TEXT,
  "event" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL DEFAULT TRUE,
  "ipAddress" TEXT,
  "details" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SecurityAuditLog_userId_createdAt_idx" ON "SecurityAuditLog"("userId", "createdAt");
CREATE INDEX "SecurityAuditLog_event_createdAt_idx" ON "SecurityAuditLog"("event", "createdAt");

CREATE TABLE "ErrorLog" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT,
  "source" TEXT NOT NULL,
  "route" TEXT,
  "statusCode" INTEGER,
  "message" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt");
CREATE INDEX "ErrorLog_source_idx" ON "ErrorLog"("source");

CREATE TABLE "SystemSetting" (
  "key" TEXT PRIMARY KEY,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "ApiCache" (
  "key" TEXT PRIMARY KEY,
  "source" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ApiCache_expiresAt_idx" ON "ApiCache"("expiresAt");

CREATE TABLE "UserRating" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "animeId" INTEGER REFERENCES "Anime"("id") ON DELETE SET NULL,
  "anilistId" INTEGER NOT NULL,
  "score" INTEGER NOT NULL CHECK ("score" >= 1 AND "score" <= 10),
  "review" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserRating_userId_anilistId_key" UNIQUE ("userId", "anilistId")
);
CREATE INDEX "UserRating_anilistId_idx" ON "UserRating"("anilistId");
