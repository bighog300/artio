# Security Notes

## Threat model summary
- Primary risks: unauthorized write actions, abusive high-volume API use, and privileged admin/cron misuse.
- Data integrity risks are concentrated in authenticated write endpoints (favorites/follows/submissions) and admin moderation surfaces.
- Operational risks include expensive query abuse (`/api/events`, `/api/search/quick`, `/api/recommendations/events`) and unsafe admin explain operations.

## Auth and admin gates
- Authenticated-only flows use shared user guards (`requireUser` / `guardUser`) for consistent 401 behavior.
- Admin routes use `requireAdmin`/`guardAdmin` and return 403 for non-admin users.
- Venue-scoped writes enforce `requireVenueRole`; global `EDITOR` and `ADMIN` roles retain intentional bypass for managed workflows.
- Perf explain routes are deny-by-default unless explicitly enabled and are blocked in production unless `PERF_EXPLAIN_ALLOW_PROD=true`.

## Rate limiting
- Best-effort token-window limits are enforced per user (or per client IP when anonymous).
- If Upstash Redis is configured, counters are shared; otherwise memory fallback is used.
- 429 responses include `Retry-After`.
- Sensitive scopes include favorites/follows writes, expensive read endpoints, recommendations events, and admin perf explain.

## Cron endpoint protections
- Cron routes require `Authorization: Bearer <CRON_SECRET>` (legacy `x-cron-secret` is also accepted).
- Unauthorized cron calls return 401 with minimal detail.
- Cron handlers log request metadata (requestId, route, method) without exposing secrets.

## Input validation and safe errors
- UUID, slug, geo coordinates, and cursor bounds are validated with zod.
- Invalid input returns 400 with safe client-facing messages.
- Internal errors are mapped to safe generic error payloads to avoid leaking SQL/Prisma internals.

## SSRF posture
- No server-side endpoint currently accepts user-provided absolute URLs for server-side fetch targets.
- Existing outbound fetch usage is limited to trusted provider infrastructure (e.g., configured services).

## Secret rotation
- Rotate `AUTH_SECRET` and `CRON_SECRET` by:
  1. Generating new random values.
  2. Updating environment variables in Vercel.
  3. Redeploying and invalidating stale sessions where required.
- Keep old/new rollout windows as short as possible.

## `/api/health` and `/api/ready` usage
- Treat these as operational probes only.
- Do not include sensitive internals in responses.
- Prefer calling these from trusted monitoring infrastructure; if exposed publicly, monitor traffic and apply upstream rate limits/WAF rules.
