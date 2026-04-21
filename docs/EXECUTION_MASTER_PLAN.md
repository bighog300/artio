# Artio — Execution Master Plan

## 🧭 Purpose

This document defines the **single source of truth for execution** in the Artio repository.

It replaces:

* scattered TODOs
* overlapping bundles
* parallel sprint plans

All work must align with:

> **the current active phase defined here**

---

# 📍 Current State

## Product

* User experience bundle: ✅ implemented
* Creator experience bundle: ✅ implemented
* Gallery/discovery system: ✅ implemented
* Core product loops: ✅ complete

## Engineering

* Prisma migration: ❌ broken (Sprint 1 issue)
* CI reliability: ❌ not guaranteed
* Test environment: ⚠️ inconsistent
* Regression coverage: ⚠️ partial

---

# 🚨 CURRENT PHASE

## **PHASE 0 — STABILITY (ACTIVE)**

> ⚠️ No other work should be prioritized until this phase is complete

---

# 🎯 Phase 0 — Stability

## Goal

Make the system:

* safe to deploy
* safe to merge
* safe to evolve

## Definition of Done

All must be true:

* [ ] Prisma migrations run on a clean database
* [ ] `pnpm prisma migrate deploy` succeeds in CI
* [ ] No P3009 migration blocking issues
* [ ] CI pipeline is green and reliable
* [ ] One stable test runner is defined and working
* [ ] Critical product flows have regression tests
* [ ] Migration recovery process is documented

---

## Phase 0 Workstreams

### 1. Migration Fix (CRITICAL PATH)

Fix:

* `20270420120000_sprint1_core_user_loop`

Required:

* ensure `UserNotificationPrefs` exists before ALTER
* fix `EventReminder.id` default
* align SQL with Prisma schema

Validate:

```bash
pnpm prisma migrate deploy
```

---

### 2. CI Hardening

CI must include:

* install
* prisma validate
* prisma generate
* prisma migrate deploy (fresh DB)
* typecheck
* lint
* tests

Add:

* migration smoke test
* actionable failure logs

---

### 3. Test Environment Stabilization

Fix:

* path alias resolution
* Next.js route test environment
* module resolution issues

Define:

```bash
pnpm test
```

as the **single authoritative command**

---

### 4. Regression Protection

Minimum required coverage:

* [ ] reminder flow
* [ ] notification preferences
* [ ] gallery save
* [ ] creator gallery publish
* [ ] scheduled publishing

---

### 5. Recovery Documentation

Create:

```bash
/docs/engineering/migration-recovery.md
```

Include:

* how to fix P3009
* when to use `migrate resolve`
* how to inspect `_prisma_migrations`
* when to reset DB vs repair

---

# 🚫 Phase 0 Constraints

Do NOT:

* add new features
* redesign UX
* start responsive work
* modify unrelated systems

---

# 🧱 Phase 1 — Responsive Upgrade

## Status

⏳ Locked until Phase 0 complete

## Goal

Make the app feel **native-quality on mobile and desktop**

## Includes

* responsive audit
* layout system
* navigation adaptation
* user flow responsiveness
* creator flow responsiveness

---

# 🎨 Phase 2 — UX Polish

## Goal

Refine product quality

## Focus areas

* feed hierarchy
* gallery identity
* creator page quality
* empty/loading states

---

# 🚀 Phase 3 — Growth

## Goal

Increase usage and discoverability

## Includes

* sharing (galleries/events)
* SEO
* creator discovery
* analytics improvements

---

# 📊 Task Prioritization Rules

## P0 — Blocking

* breaks deploy
* breaks CI
* breaks core flow

## P1 — High impact

* improves core UX
* improves responsiveness
* improves performance

## P2 — Nice to have

* polish
* optimization
* secondary features

---

# 🧠 Execution Rules

## Rule 1 — Follow phase order strictly

Do not start a later phase early.

---

## Rule 2 — Always audit before building

Each sprint must begin with:

* audit doc
* execution checklist

---

## Rule 3 — Extend, don’t duplicate

Reuse:

* Collection as gallery
* existing APIs
* existing components

---

## Rule 4 — Validate before moving on

Each phase must meet its Definition of Done.

---

## Rule 5 — Tie work to acceptance criteria

No feature is complete without:

* validation
* test coverage (for core flows)

---

# 📂 Supporting Documents

## Product

```bash
/docs/product/
  user-experience.md
  creator-experience.md
  acceptance-criteria.md
```

## Engineering

```bash
/docs/engineering/
  migration-recovery.md
  ci-rules.md
```

## UI

```bash
/docs/ui/
  responsive-system.md
```

---

# 🧭 How to Use This Plan

For every task:

1. Check current phase
2. Confirm task belongs in this phase
3. Follow execution rules
4. Update checklist
5. Validate against acceptance criteria

---

# 🎯 Final Principle

> Artio is now a **system**, not a prototype.

Execution must be:

* deliberate
* ordered
* validated

---

# 📌 One-Line Priority

> **Stabilize the system before evolving it.**
