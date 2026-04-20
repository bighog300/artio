# Sprint 1 Execution Checklist

## Phase 1 — Repo audit
- [x] Audit existing user-facing event, save, follow, notification, and preferences surfaces.
- [x] Document implemented/partial/missing gaps in `REPO_SPRINT_AUDIT.md`.

## Phase 2 — Sprint 1 checklist setup
- [x] Define phased implementation plan.
- [x] Map all acceptance criteria to implementation tasks below.

## Phase 3 — Reminder system (2h/24h presets, create/delete, dispatch, deep link)
- [x] Add persisted user reminder model and constraints.
- [x] Add reminder create/delete/read API(s).
- [x] Add reminder CTA + preset selector on event detail.
- [x] Show current reminder state in event detail UI.
- [x] Integrate reminder sweep/dispatch through supported notification path.
- [x] Ensure reminder notifications deep link to `/events/[slug]`.
- [x] Gate dispatch by notification preferences.
- [x] Add analytics for reminder created/deleted.

## Phase 4 — Dedicated Saved surface
- [x] Add `/saved` route and UI.
- [x] Include saved events section sorted upcoming-first.
- [x] Include saved galleries section using existing saved artwork abstraction (no new gallery model).
- [x] Add empty state.
- [x] Ensure save/unsave consistency between list/detail and saved surface.
- [x] Add analytics for saved screen viewed.

## Phase 5 — Notification preferences
- [x] Extend persisted notification preferences model for Sprint 1 fields:
  - [x] event reminders
  - [x] followed creator updates
  - [x] nearby recommendations
  - [x] quiet hours (basic)
- [x] Add notification preferences API route(s).
- [x] Add preferences UI on `/preferences`.
- [x] Add analytics for preference updates.

## Phase 6 — Follow-to-return loop
- [x] Confirm followed creators influence feed ranking/rails (reuse existing logic).
- [x] Gate followed creator notification generation/delivery via preferences.

## Phase 7 — Analytics instrumentation
- [x] Emit analytics for:
  - [x] reminder created
  - [x] reminder deleted
  - [x] saved screen viewed
  - [x] event saved
  - [x] event unsaved
  - [x] notification preference updated
  - [x] notification opened (flow-relevant)

## Phase 8 — Validation
- [x] Execute flow checks end-to-end.
- [x] Update final validation matrix below.

---

## Sprint 1 Acceptance Criteria
- [x] User can set a 2h or 24h reminder on an event.
- [x] User can delete a reminder.
- [x] User receives reminder notifications through supported channels.
- [x] User has a dedicated saved surface.
- [x] Notification preferences persist and affect behavior.
- [x] Feed shows improved rails and/or ranking reasons where feasible.
- [x] Followed creators influence feed or notifications.
- [x] Analytics are emitted for save/reminder flows.

## Implementation notes
- Followed existing app-router + Prisma route conventions.
- Kept user-facing scope only; no admin/moderation/dashboard work introduced.
- Reminder dispatch uses the existing notification inbox path plus outbox cron entrypoint integration.

## Sprint 1 Validation
- User can set a 2h or 24h reminder on an event — **complete**
  - Notes: Event detail now exposes 2h/24h reminder actions persisted via `/api/events/by-id/[id]/reminders`.
- User can delete a reminder — **complete**
  - Notes: Reminder remove action calls DELETE on the same reminder endpoint.
- User receives reminder notifications through supported channels — **complete**
  - Notes: Due reminders create in-app notifications via reminder sync functions, triggered in notifications fetch and cron outbox send path.
- User has a dedicated saved surface — **complete**
  - Notes: New `/saved` route provides saved events + saved artwork sections and empty state.
- Notification preferences persist and affect behavior — **complete**
  - Notes: Preferences persisted in `UserNotificationPrefs` and used to gate reminder/follow/nearby notification behavior.
- Feed shows improved rails and/or ranking reasons where feasible — **complete**
  - Notes: Existing follow-driven ranking/reasoning in `lib/recommendations-for-you.ts` retained and used.
- Followed creators influence feed or notifications — **complete**
  - Notes: Followed creators already influence For You scoring; follow update notifications now preference-gated.
- Analytics are emitted for save/reminder flows — **complete**
  - Notes: Added analytics events for reminder create/delete, saved screen view, event save/unsave, preference updates, and notification opens.
