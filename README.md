# Artpulse
test x
Artpulse is an art community web app focused on discovering, publishing, and following art events from galleries, museums, artists and artworks.

## What Artpulse Does (MVP)

- Discover upcoming art events by location and date
- Browse galleries and museums and their programs
- View artist profiles and associated events
- Calendar-based views (month / week / list)
- Save favourites (events, venues, artists)
- Admin/editor tools to publish and manage content

## Core Principles

- Location-first discovery
- Editorial-quality event pages
- Fast, accessible, mobile-first UI
- Clean separation between public content and admin tools

## Tech Stack (summary)

- Next.js (App Router)
- TypeScript
- Postgres + Prisma
- Auth.js / NextAuth
- Deployed on Vercel

## Repo Expectations

Single Next.js app at repo root (recommended for Vercel):

```
/app
/components
/lib
/prisma
/public
```

## Local Development

```bash
pnpm install
pnpm dev
```

See `ENVIRONMENT.md` for required environment variables.

For deployment topology and DB automation, see:
- `docs/ENVIRONMENTS.md`
- `docs/DB_WORKFLOWS.md`

## Database & Prisma Commands

```bash
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:deploy
SEED_ENABLED=true pnpm db:seed
```

## Auth secret required

`AUTH_SECRET` must be set for preview/production-like environments (`VERCEL=1` or `NODE_ENV=production`).

- Generate one with `openssl rand -base64 32`
- Set it in your `.env.local` for local production testing
- Set it in Vercel environment variables for Preview and Production

If missing in production-like environments, auth boot will fail fast with a clear error.

## Deployment

- Push to GitHub
- Import repo into Vercel
- Configure environment variables
- Deploy

## Vercel Deployment Checklist

1. In Vercel Project Settings → General, set **Node.js Version** to `20.x` so it matches `engines.node` and local/CI builds.
2. Set the following **production** environment variables in Vercel:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `AUTH_SECRET`
   - `NEXTAUTH_URL`
   - `CRON_SECRET`
   - `AUTH_GOOGLE_ID`
   - `AUTH_GOOGLE_SECRET`
   - `GEOCODER_PROVIDER` (`mapbox` default, set to `google` to use Google server-side geocoding)
   - `GOOGLE_MAPS_API_KEY` (required when `GEOCODER_PROVIDER=google`; server-side only, never `NEXT_PUBLIC_*`)
   - Optional: `NEXT_PUBLIC_MAPBOX_TOKEN` (canonical; `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` also works for any client Mapbox usage)
   - `MAPBOX_ACCESS_TOKEN` (server-side only, used by Mapbox forward geocoding in `lib/geocode/mapbox-forward.ts`)
   - Note: `/nearby` map rendering now uses Leaflet + OpenStreetMap and does not require a public Mapbox token.
3. Ensure the production database is reachable from Vercel.
4. Run migrations on deploy (`pnpm prisma:deploy`) before serving traffic.
5. Optionally run `SEED_ENABLED=true pnpm db:seed` for initial sample/admin data.
6. Verify `/api/health` and `/api/ready` return `{ ok: true }` after deployment.
7. Run `pnpm check-env` in CI/production build pipelines to enforce env contract.

## Private beta access control

Set these env vars to enable private beta mode:

- `BETA_MODE=1` to enable gating.
- `BETA_ALLOWLIST=a@x.com,b@y.com` for exact email allowlist.
- `BETA_ALLOW_DOMAINS=example.com,another.com` for domain allowlist.
- `BETA_ADMIN_EMAILS=admin@x.com` to always permit admin operators.
- `BETA_REQUESTS_ENABLED=1` to show the request-access form on `/beta`.

When beta mode is enabled, non-allowlisted users are redirected to `/beta`, where they can request access and send feedback. Admins can review requests and feedback at `/admin/beta`. Allowlist values are environment-driven and require redeploy to take effect.

## Neon preview branch lifecycle

- Preview Neon branches use a deterministic per-PR name (`pr-<number>`), so reruns reuse the same branch instead of creating duplicates.
- When a pull request is closed, GitHub Actions automatically runs cleanup to delete that preview branch.
