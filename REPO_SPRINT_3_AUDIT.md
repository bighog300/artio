# Sprint 3 Repo Audit (Creator Platform)

## Existing creator dashboard (`/my`)
- **Status: partial**
- `/my` shell, subnav, and creator surfaces already exist (`/my/events`, `/my/artwork`, `/my/artist`, `/my/analytics`).
- Gap: no first-class `/my/galleries` creator workflow, and creator loop currently splits across unrelated pages.

## Existing event publishing flows
- **Status: partial**
- Event draft/edit/publish already exists (`/my/events/new`, `/my/events/[eventId]`, publish panel + readiness checks).
- Gap: flow is still mostly form-first; preview and explicit guided steps are limited.
- Gap: no creator-facing scheduled publish option for events.

## Existing artwork / collection system (used as galleries)
- **Status: partial (reusable foundation present)**
- `Collection` + `CollectionItem` already powers gallery-like public pages (`/galleries`, `/galleries/[id]`).
- Collections are currently generic save-lists, not full creator publishing artifacts.
- **Critical decision:** Sprint 3 reuses **Collection as the gallery model** and extends it for creator publishing. No new gallery model is introduced.

## Current media upload system
- **Status: implemented**
- Asset system and creator-owned uploads already exist (artist images, artwork images, venue images, featured assets).
- Existing upload ownership checks can be reused for gallery cover/artwork image references.

## Current creator profile / public pages
- **Status: partial**
- `/users/[username]` exists with profile + recent activity, saved events, collections, following.
- Gap: lacks destination-style creator mini-site structure (hero/banner emphasis, structured upcoming events + gallery spotlight + outbound links).

## Current analytics implementation
- **Status: partial**
- `/my/analytics` includes artwork stats + registration analytics.
- Gap: creator-level insights are not unified enough (top events + top galleries + follows/saves trends in one creator-oriented view).

## Summary classification
- Implemented: media upload foundations.
- Partial: dashboard cohesion, event UX guidance, collections-as-galleries publishing behavior, public creator mini-site, creator analytics breadth.
- Missing: scheduled publishing in creator flows.
