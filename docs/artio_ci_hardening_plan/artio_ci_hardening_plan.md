# Artio CI Hardening Plan

## Objective

Make CI reliable, predictable, and safe for schema, app, and deployment changes.

This plan is tailored to the current Artio repo state, especially:
- Prisma migration failure risk
- deploy pipeline fragility
- incomplete verification around migration + runtime behavior
- inconsistent confidence between “typecheck passes” and “app is actually safe to ship”

---

## Success criteria

CI is considered hardened when:

1. `prisma migrate deploy` succeeds consistently on clean CI databases.
2. Failed migrations cannot silently block later deploys without clear diagnosis.
3. Every PR gets the same core validation:
   - install
   - generate
   - typecheck
   - lint
   - tests
   - migration validation
4. Deploy pipelines fail early with actionable logs.
5. Branch protection only allows merge when required checks pass.
6. Release confidence no longer depends on manual interpretation.

---

## Phase 1 — Stop the current failure mode

### 1. Fix the Sprint 1 migration permanently
Priority: Critical

Actions:
- patch `20270420120000_sprint1_core_user_loop/migration.sql`
- ensure `UserNotificationPrefs` exists before `ALTER TABLE`
- align `EventReminder.id` SQL default with Prisma schema
- verify foreign keys, indexes, and uniqueness constraints
- validate migration on a fresh database from zero

Definition of done:
- full migration chain applies to a clean DB
- no P3009 from that migration in CI

### 2. Add migration smoke test job
Priority: Critical

Create a CI job that:
- provisions a fresh Postgres instance
- runs:
  - `pnpm prisma validate`
  - `pnpm prisma generate`
  - `pnpm prisma migrate deploy`
- fails immediately on any migration inconsistency

Definition of done:
- migration failures are caught before build/test stages finish

### 3. Add migration diagnostics on failure
Priority: Critical

On migration failure, emit:
- failing migration name
- `_prisma_migrations` status query output
- current database schema snapshot for affected tables if practical
- exact Prisma command output

Definition of done:
- engineers can identify the failure cause from CI logs without rerunning locally first

---

## Phase 2 — Stabilize core CI checks

### 4. Standardize required PR checks
Priority: High

Required checks for every PR:
1. install dependencies
2. `pnpm prisma validate`
3. `pnpm prisma generate`
4. `pnpm typecheck`
5. `pnpm lint`
6. unit/integration tests
7. migration smoke test

If available, also run:
- focused Next.js route tests
- recommendation tests
- publish-flow tests

Definition of done:
- every PR gets the same minimum confidence bar

### 5. Split CI into fast and slow lanes
Priority: High

Use at least two categories:

Fast lane:
- install
- generate
- typecheck
- lint
- small unit tests

Slow lane:
- migration deploy
- integration tests
- route tests
- scheduled publish tests
- notification/reminder tests if available

Definition of done:
- quick feedback in minutes
- deeper confidence without blocking developer iteration unnecessarily

### 6. Cache intelligently
Priority: Medium

Cache:
- pnpm store
- Next.js build cache if appropriate
- Prisma client generation outputs only if safe and deterministic

Do not cache:
- database state used for migration correctness
- anything that can mask migration errors

Definition of done:
- faster CI without hiding schema issues

---

## Phase 3 — Make deploys safer

### 7. Separate PR validation from deploy validation
Priority: High

PR CI should answer:
- Is this code safe to merge?

Deploy pipeline should answer:
- Is this code safe to release into the target environment?

Deploy pipeline should include:
- migrate status
- migrate deploy
- app build
- post-migration health check
- optional lightweight smoke test against deployed preview/staging

Definition of done:
- deployment failures are isolated from PR signal

### 8. Add staging-first release gate
Priority: High

For schema-affecting changes:
- deploy to staging first
- run migration
- run smoke tests
- only then allow production promotion

Definition of done:
- migration breakage is caught before production

### 9. Add rollback / recovery runbook
Priority: High

Document:
- what to do for P3009
- when to use `prisma migrate resolve`
- when to recreate CI DB vs repair shared DB
- how to inspect `_prisma_migrations`
- how to confirm partial migration effects

Store as:
- `docs/ci/migration-recovery.md`

Definition of done:
- recovery steps are explicit, not tribal knowledge

---

## Phase 4 — Increase test confidence where it matters

### 10. Add targeted regression tests for product-critical loops
Priority: High

Minimum targets:
- event reminder create/delete flow
- notification preference persistence
- gallery save flow
- scheduled publish route
- creator gallery publish flow

Definition of done:
- the three delivered product phases are protected from regressions

### 11. Fix path-alias / ESM test reliability
Priority: High

The reported test failures around:
- `next/server`
- path alias resolution
- direct `node --test` environment mismatch

suggest the test environment is not aligned with the app runtime.

Actions:
- standardize one supported test runner setup
- configure alias resolution properly
- make route tests run in a framework-compatible environment
- document which test command is authoritative

Definition of done:
- tests fail because code is broken, not because the runner is misconfigured

### 12. Add route-level smoke coverage for critical endpoints
Priority: Medium

Critical routes:
- reminder APIs
- notification preferences API
- gallery publish/schedule APIs
- cron publish route

Definition of done:
- key app flows are validated at API boundary level

---

## Phase 5 — Harden governance and developer workflow

### 13. Protect branches with required checks
Priority: High

Require passing checks before merge for:
- typecheck
- lint
- tests
- migration smoke test

Definition of done:
- broken schema or failing checks cannot be merged casually

### 14. Add PR template for risky changes
Priority: Medium

Template should ask:
- Does this change modify Prisma schema or migrations?
- Does it affect notifications, scheduled publishing, or cron?
- What test coverage was added?
- Was a fresh migration deploy validated?

Definition of done:
- risky changes are reviewed with the right context

### 15. Add CODEOWNERS for migration and deployment files
Priority: Medium

Recommended ownership:
- `prisma/**`
- `.github/workflows/**`
- cron routes
- notification infrastructure

Definition of done:
- sensitive changes get the right reviewers automatically

---

## Phase 6 — Improve observability

### 16. Add structured CI summaries
Priority: Medium

At the end of CI, publish a concise summary:
- install result
- typecheck result
- lint result
- tests result
- migration result
- artifact links/logs

Definition of done:
- one quick place to assess build health

### 17. Emit deploy-time migration telemetry
Priority: Medium

Track:
- migration duration
- failure rate
- failing migration names
- environment
- deploy success/failure

Definition of done:
- migration reliability becomes measurable over time

---

## Recommended implementation order

### Week 1
- Fix Sprint 1 migration
- Add migration smoke test
- Add failure diagnostics
- Protect branch with required checks

### Week 2
- Split CI into fast/slow lanes
- Standardize test runner + alias resolution
- Add targeted regression tests for reminder/gallery/scheduling flows

### Week 3
- Add staging gate
- Add migration recovery runbook
- Add PR template and CODEOWNERS

### Week 4
- Add CI summaries
- Add deployment telemetry
- Tune caching and runtime efficiency

---

## Suggested CI pipeline shape

### PR pipeline
1. install
2. prisma validate
3. prisma generate
4. typecheck
5. lint
6. unit tests
7. migration smoke test
8. integration tests (selective or matrix-based)

### Main/develop pipeline
1. all PR-equivalent checks
2. build
3. deploy to staging
4. migrate deploy
5. smoke test
6. optional approval gate
7. production deploy

---

## Repo TODOs to add immediately

### Critical
- Fix `20270420120000_sprint1_core_user_loop/migration.sql`
- Add CI migration smoke job
- Add migration recovery doc
- Make migration smoke job required for merge

### High
- Standardize test environment for Next.js route tests
- Add regression tests for reminders, galleries, scheduling
- Add staging release gate

### Medium
- Add PR template for schema/deploy changes
- Add CODEOWNERS for Prisma/workflows
- Add CI summary output
- Add deploy telemetry

---

## Suggested files to create

- `.github/workflows/ci.yml` or split workflow equivalents
- `.github/pull_request_template.md`
- `docs/ci/migration-recovery.md`
- `CODEOWNERS`
- optional `scripts/ci/migration-diagnostics.ts` or shell equivalent

---

## Final recommendation

Your repo is no longer primarily blocked by feature delivery.

It is now blocked by:
1. migration safety
2. CI signal quality
3. test environment reliability
4. release discipline

The best next move is to treat CI hardening as product work, not just infrastructure cleanup.
