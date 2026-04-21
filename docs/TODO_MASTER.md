# Artio — TODO Master Backlog

## 🧭 Purpose

This document is the **single source of truth for all tasks** in the Artio repository.

It replaces:

* scattered TODOs
* bundle checklists
* sprint-specific task lists

All tasks are organized by:

* execution phase
* priority (P0, P1, P2)

---

# 🚨 CURRENT PHASE

## **PHASE 0 — STABILITY (ACTIVE)**

> ⚠️ Only P0 and P1 tasks in this phase should be worked on now
> ⛔ Do NOT start Phase 1 (Responsive) until Phase 0 is complete

---

# 🔴 P0 — CRITICAL (Blocking)

## Migration Fix

* [ ] Fix `20270420120000_sprint1_core_user_loop` migration
* [ ] Ensure `UserNotificationPrefs` exists before ALTER
* [ ] Add DB default for `EventReminder.id`
* [ ] Align migration SQL with Prisma schema
* [ ] Validate full migration chain on clean DB

---

## CI Reliability

* [ ] Add migration smoke test (fresh DB)
* [ ] Ensure CI runs:

  * [ ] `pnpm prisma validate`
  * [ ] `pnpm prisma generate`
  * [ ] `pnpm prisma migrate deploy`
  * [ ] `pnpm typecheck`
  * [ ] `pnpm lint`
  * [ ] `pnpm test`
* [ ] Improve migration failure logs (show failing migration clearly)

---

## Test Environment Stabilization

* [ ] Fix path alias issues in tests
* [ ] Fix Next.js route test environment
* [ ] Resolve ESM/module resolution issues
* [ ] Define one authoritative test command (`pnpm test`)
* [ ] Ensure tests fail only for real issues

---

## Regression Protection (Core Flows)

* [ ] Add reminder flow test (create/delete/deliver)
* [ ] Add notification preferences test (persist + apply)
* [ ] Add gallery save test
* [ ] Add creator gallery publish test
* [ ] Add scheduled publishing test

---

## Recovery Documentation

* [ ] Create `/docs/engineering/migration-recovery.md`
* [ ] Document:

  * [ ] P3009 recovery
  * [ ] when to use `migrate resolve`
  * [ ] how to inspect `_prisma_migrations`
  * [ ] when to reset DB vs repair

---

# 🟠 P1 — HIGH PRIORITY (After P0)

## CI Hardening Enhancements

* [ ] Split CI into fast vs slow lanes
* [ ] Add CI summary output
* [ ] Add PR template for schema/deploy changes
* [ ] Add CODEOWNERS for:

  * [ ] `prisma/`
  * [ ] `.github/workflows/`
  * [ ] cron routes

---

## Additional Regression Coverage

* [ ] Add route-level tests for reminder APIs
* [ ] Add route-level tests for gallery APIs
* [ ] Add route-level tests for scheduled publish endpoints
* [ ] Add notification dispatch tests

---

## Developer Experience

* [ ] Document test setup in `/docs/engineering/testing.md`
* [ ] Document CI rules in `/docs/engineering/ci-rules.md`
* [ ] Ensure local dev mirrors CI behavior

---

# 🟡 P2 — NICE TO HAVE (Phase 0 polish)

* [ ] Add CI artifact logs for debugging
* [ ] Add migration telemetry (duration, failures)
* [ ] Add visual regression checks (core screens)
* [ ] Improve test speed and caching

---

# 🧱 PHASE 1 — RESPONSIVE (LOCKED)

> 🔒 Do not start until Phase 0 is complete

## P1 — Core Work

* [ ] Create `RESPONSIVE_AUDIT.md`
* [ ] Define responsive system (breakpoints + rules)
* [ ] Fix shared UI primitives
* [ ] Fix navigation (mobile + desktop)

---

## P1 — User Surfaces

* [ ] Fix For You feed layout
* [ ] Fix event detail layout
* [ ] Fix gallery detail layout
* [ ] Fix saved screen layout
* [ ] Fix search responsiveness

---

## P1 — Creator Surfaces

* [ ] Fix event editor mobile UX
* [ ] Fix gallery editor mobile UX
* [ ] Fix creator dashboard responsiveness
* [ ] Fix public creator page layout

---

## P2 — Secondary

* [ ] Improve analytics responsiveness
* [ ] Improve settings/preferences layout
* [ ] Tablet-specific tuning

---

# 🎨 PHASE 2 — UX POLISH

## P1 — Core Improvements

* [ ] Improve feed hierarchy and density
* [ ] Improve gallery visual identity (exhibition feel)
* [ ] Improve creator page presentation
* [ ] Improve empty states across app

---

## P2 — Additional Polish

* [ ] Improve loading states
* [ ] Improve transitions and motion
* [ ] Improve micro-interactions

---

# 🚀 PHASE 3 — GROWTH

## P1 — Core Growth

* [ ] Add gallery sharing
* [ ] Add event sharing
* [ ] Improve SEO pages
* [ ] Improve creator discoverability

---

## P2 — Expansion

* [ ] Advanced analytics
* [ ] Recommendation tuning
* [ ] Content amplification features

---

# 📊 PRIORITY DEFINITIONS

## 🔴 P0 — Blocking

* breaks deploy
* breaks CI
* breaks core product loop

## 🟠 P1 — High Impact

* improves UX significantly
* improves reliability
* improves performance

## 🟡 P2 — Nice to Have

* polish
* optimization
* secondary improvements

---

# 🧠 RULES

* Only work on the **current phase**
* Complete **P0 before P1**
* Do not skip validation
* Tie work to acceptance criteria
* Keep system stable before expanding

---

# 🎯 FINAL PRINCIPLE

> **Stability → Responsiveness → Polish → Growth**
