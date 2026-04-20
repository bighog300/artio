# Sprint 1 Repo Audit (Core User Loop)

## Existing user-facing event surfaces
- `/events` list with save actions, filters, and cards.
- `/events/[slug]` detail page with save + attend + calendar actions.
- `/for-you` personalized feed surface.
- `/following` follow-based feed updates.
- `/calendar` with saved-events subscription link.

## Existing save/favorite functionality
- Generic favorites API at `POST/DELETE /api/favorites` with `FavoriteTargetType` support (`EVENT`, `VENUE`, `ARTIST`, `ARTWORK`).
- Reusable `SaveButton` and `SaveEventButton` used across event list/detail surfaces.
- Existing saved concepts:
  - saved searches (`/saved-searches`)
  - user collection for artworks (`/my/collection`)
- No dedicated consolidated `/saved` user surface for saved events + galleries/artworks.

## Existing follow functionality
- Follow API (`/api/follows`) and reusable `FollowButton`.
- Followed artists/venues already influence:
  - following feed (`/following`)
  - for-you ranking reasons and scoring (`lib/recommendations-for-you.ts`).
- Follow-based notifications pipeline exists (`domains/notification/follow-event-notifications.ts`) and sync is invoked from notifications API.

## Existing notification infrastructure
- Notification inbox table + UI at `/notifications`.
- Notification outbox + cron sender exists (`/api/cron/outbox/send`, `lib/outbox-worker.ts`).
- Notification templates and deep links exist for several notification types.
- Existing event reminder support is currently registration/email-oriented and only `EVENT_REMINDER_24H` from outbox sweep over confirmed registrations.

## Existing preferences/settings models and UI
- Preferences page at `/preferences` exists.
- Current persisted preferences:
  - digest settings on `User` model (`digestEventsOnly`, `digestMaxEvents`, `digestRadiusKm`, etc.).
  - `UserNotificationPrefs` currently contains submission/team/digest booleans only.
- Missing user-facing notification preference panel for reminder/followed creator/nearby/quiet hours.

## Existing reminder-related code, templates, jobs, APIs
- Outbox reminder sweep in `lib/outbox-worker.ts` for 24h reminders based on registrations.
- Notification template payload + email template for `EVENT_REMINDER_24H`.
- No user-managed event reminder model.
- No event detail reminder CTA/preset selector.
- No create/delete reminder API for user-managed reminders.

## Sprint 1 gaps

### Implemented
- Save/unsave foundation for events exists across list/detail.
- Follow graph and follow-influenced ranking already exist in core recommendation logic.
- Notification inbox/outbox delivery infrastructure exists.

### Partial
- Reminder support exists only for registration-based 24h outbox reminders, not user-created reminders with presets.
- Saved capabilities exist but are fragmented (saved searches, artwork collection) with no dedicated Saved route.
- Followed creator notifications exist but are not currently preference-gated.
- Analytics framework exists, but sprint-required reminder/saved/preference event coverage is incomplete.

### Missing
- User-created event reminders with 2h/24h presets.
- Reminder deletion and persisted reminder state on event detail.
- Reminder dispatch tied to user reminder records (with deep links).
- Dedicated `/saved` surface with saved events (upcoming-first) and gallery/artwork section/placeholder.
- User notification preference UI + persistence for:
  - event reminders
  - followed creator updates
  - nearby recommendations
  - quiet hours
- Preference gating for followed creator notifications and reminder dispatch.
- Required analytics events for sprint loop (created/deleted reminders, saved surface viewed, save/unsave, preference updates, notification opened for flow).

## Blockers
- None currently identified. Proceeding in requested execution order.
