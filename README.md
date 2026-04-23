# Artpulse

Artpulse is a Next.js application for discovering, publishing, and managing art events, artists, venues, and artworks.

## Architecture Overview

- **Frontend/API**: Single Next.js App Router project (`app/`, `components/`, `lib/`).
- **Database**: PostgreSQL accessed through Prisma.
- **Auth**: Auth.js / NextAuth.
- **Queue/Rate-Limit Cache**: Redis via Upstash REST API.
- **Storage**: Vercel Blob for uploaded media.
- **Hosting**: Vercel (preview + production).

This repository is standardized to **one deployment model: Vercel + PostgreSQL + Upstash Redis**.

## Quick Start (Local Development)

### 1) Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+
- Redis (optional for local, required in production)

### 2) Configure environment variables

1. Copy the example file:

```bash
cp .env.example .env.local
```

2. Fill placeholders in `.env.local`.
3. **Do not commit `.env.local` or any secret-bearing `.env` file.**

### 3) Install and run

```bash
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

App runs at `http://localhost:3000`.

## Environment Variables

Use `.env.example` as the source of truth.

### Build-time vs runtime

- **Build-time (Vercel build / CI checks)**:
  - `DATABASE_URL`
  - `AUTH_SECRET` and `NEXTAUTH_SECRET` (same value)
  - `CRON_SECRET`
  - `AI_INGEST_IMAGE_ENABLED` (when `VERCEL=1`)
- **Runtime (server)**:
  - Database, auth, Redis, Stripe/Webhook, AI ingest, geocoding, and ops secrets
- **Runtime (client-exposed)**:
  - `NEXT_PUBLIC_*` variables only (non-secret)

Never place secrets in `NEXT_PUBLIC_*` variables.

## Database Standard

This project uses **PostgreSQL only**.

- `DATABASE_URL` is required.
- `DIRECT_URL` is optional and can be used for direct Prisma connections.
- No SQLite fallback is part of the production model.

## Redis Standard

Production should use Upstash Redis REST credentials:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

If Redis is missing locally, some features may fall back to in-memory behavior. Do not rely on that for production.

## Deployment (Vercel)

1. Push repository to Git provider.
2. Import project into Vercel.
3. Set Node.js to `20.x` in project settings.
4. Add environment variables from `.env.example` (production and preview scopes).
5. Use build command:

```bash
pnpm vercel:build
```

6. Ensure migrations are applied during deployment:

```bash
pnpm prisma:deploy
```

7. Validate after deploy:

- `GET /api/health`
- `GET /api/ready`

## CI/CD

See [`CI_CD.md`](./CI_CD.md) for the standardized pipeline and release flow.

## Security Notes

- Rotate all secrets regularly (`AUTH_SECRET`, `NEXTAUTH_SECRET`, `CRON_SECRET`, `OPS_SECRET`, provider keys).
- Keep `AUTH_SECRET` and `NEXTAUTH_SECRET` identical to prevent auth mismatch.
- Restrict cron and ops endpoints with strong shared secrets.
- Use least-privilege database and third-party service credentials.
- Avoid printing sensitive env values in logs.

## No Official Docker Deployment in This Repo

There is currently no first-party Dockerfile or docker-compose deployment path in this repository.

To avoid drift and conflicting instructions, operational docs are standardized around Vercel deployments.
