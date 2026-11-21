# Changelog

## 2026-11-21 — Full-Stack Audit & Platform Upgrade

### Access, Conversion & Retention
- Removed global login gate across discovery, schedule, details, and watch routes; added local guest watchlist/favorites/history storage with one-click cloud sync after login.
- Added first-visit hero value statement, 3-step post-signup onboarding modal, AniList/MAL XML/JSON list importer, and public `/u/:username` profiles.

### Security & Backend Hardening
- Enforced production boot secret validation (`AUTH_SECRET`, `ADMIN_ACCESS_PASSWORD`) and blocked `.data/` filesystem persistence in `NODE_ENV=production`.
- Added per-request CSP nonces, `Strict-Transport-Security`, COOP/CORP headers, `APP_URL` CORS allowlist, double-submit CSRF tokens, Zod validation schemas, login lockout, and shared `/api` rate limiting.
- Sandboxed all embedded iframes (`TrailerModal`, `OfficialTrailerSpotlight`, `AnimeDetailsPage`, `ProviderManager`, `Player`).

### SEO, PWA, AI & Performance
- Added server-side dynamic OG meta injection for `/anime/:slug`, paginated XML sitemap index, and `/robots.txt` rules.
- Configured `vite-plugin-pwa` with offline artwork/catalog caching, `PWAInstallButton`, `OfflineIndicator`, `PWAUpdatePrompt`, and consent-gated analytics banner.
- Integrated server-side `@google/genai` endpoints for AI natural-language search, mood picker, and spoiler-free summaries.
- Split `AdminPage` into lazy-loaded tab modules, dynamically imported `hls.js`, added SWR deduplication caching, and enabled TypeScript `"strict": true` with ESLint, Vitest, Playwright, and GitHub Actions CI.
