# CI/CD — Artpulse (Standardized)

This repository uses a single deployment model:

- **CI**: GitHub Actions
- **Hosting**: Vercel (Preview + Production)
- **Database**: PostgreSQL
- **Cache/Rate limit store**: Upstash Redis (runtime)

## CI Pipeline (GitHub Actions)

Recommended checks for pull requests and `main` pushes:

1. Install dependencies (`pnpm install --frozen-lockfile`)
2. Lint (`pnpm lint`)
3. Typecheck (`pnpm typecheck`)
4. Tests (`pnpm test`)
5. Build contract checks (`pnpm check-env`)
6. Application build (`pnpm build` or `pnpm vercel:build`)

## Environment Handling in CI

- Use repository/environment secrets in CI; never commit secrets.
- Use `.env.example` for variable names and defaults/placeholders.
- In deploy-like CI contexts (`CI=true`), ensure at minimum:
  - `DATABASE_URL`
  - `AUTH_SECRET` and `NEXTAUTH_SECRET` (same value)
  - `CRON_SECRET`

## Deployment Flow

- `main` branch deploys to **Production** on Vercel.
- Pull requests deploy to **Preview** on Vercel.

Recommended Vercel build command:

```bash
pnpm vercel:build
```

This validates required env vars before `next build`.

## Database Migrations

- Do **not** run ad-hoc production migrations from arbitrary CI jobs.
- Run Prisma deploy migrations in controlled deploy flow:

```bash
pnpm prisma:deploy
```

## Post-Deploy Verification

After each production deploy, verify:

- `GET /api/health` returns success
- `GET /api/ready` returns success
- Critical auth and admin routes are reachable for authorized users

## Docker Note

There is no official Docker/deployment path in this repo today.
To prevent conflicting runbooks, CI/CD and operations are standardized on Vercel.
