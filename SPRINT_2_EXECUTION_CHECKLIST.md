# Sprint 2 Execution Checklist

## Phase plan

1. **Repository audit + decision record**
   - [x] Produce Sprint 2 audit doc.
   - [x] Decide gallery implementation strategy.

2. **Gallery product surfaces**
   - [x] Add gallery list route.
   - [x] Add gallery detail route.
   - [x] Add reusable gallery card UI.
   - [x] Ensure gallery data shape is distinct from single artwork.

3. **Gallery save flow**
   - [x] Add gallery save CTA using collection follow/save infrastructure.
   - [x] Ensure saved state renders correctly for signed-in users.

4. **Discovery feed upgrades (events + galleries)**
   - [x] Extend discovery/recommendation payload to include gallery entities.
   - [x] Implement coherent mixed rendering with clear item labeling.
   - [x] Add lightweight diversification strategy (event/gallery interleave with alternating cadence).
   - [x] Preserve explanation affordances for event cards.

5. **Recommendation Phase-2 signal improvements**
   - [x] Extend scoring to use additional available behavior signals (event reminders) without replacing deterministic fallback.
   - [x] Preserve cold-start deterministic behavior.

6. **Search improvements**
   - [x] Add segmented/tabbed search for events, galleries, creators, and venues.

7. **Validation + hardening**
   - [x] Run focused tests/type checks.
   - [x] Confirm no admin/creator publishing surfaces were modified.
   - [x] Update acceptance status section.

## Acceptance criteria

- [x] Gallery exists as a first-class user concept
- [x] Gallery list route exists
- [x] Gallery detail route exists
- [x] User can save a gallery
- [x] Explore can surface both events and galleries coherently
- [x] Recommendations use at least some behavior signals in addition to basic deterministic rules
- [x] Search supports the main user entities that actually exist in the repo
- [x] No admin or creator publishing surfaces were modified unintentionally

## Blockers
- None currently.

## Sprint 2 Validation

- Gallery exists as a first-class user concept: **complete**
  - Added dedicated `/galleries` and `/galleries/[id]` routes plus gallery-specific card/saving UX.
- Gallery list route exists: **complete**
  - Implemented in `app/galleries/page.tsx`.
- Gallery detail route exists: **complete**
  - Implemented in `app/galleries/[id]/page.tsx` with hero, creator block, ordered sequence, and related events.
- User can save a gallery: **complete**
  - `SaveGalleryButton` uses `POST/DELETE /api/collections/[id]/follow`.
- Explore can surface both events and galleries coherently: **complete**
  - `/for-you` now receives gallery recommendations and renders an interleaved mixed discovery feed.
- Recommendations use behavior signals in addition to deterministic rules: **complete**
  - Added reminder-derived venue/artist/tag boosts while preserving baseline deterministic fallback.
- Search supports main user entities: **complete**
  - `/search` now supports segmented tabs for events, galleries, creators, and venues.
- No admin or creator publishing surfaces modified unintentionally: **complete**
  - Scope limited to user-facing discovery/browsing/search/recommendation files.
