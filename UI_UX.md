# UI & UX — Artpulse

## Public screens
- Home: upcoming near you + quick filters
- Search: keyword + filters (persist in URL)
- Events list: chronological
- Event detail: hero, key facts, map, CTA, gallery, tags, related
- Venue detail: profile + gallery + grouped upcoming/past events + strong event CTAs
- Artist detail: profile + events
- Calendar: month/week/list + filters

## Admin
- Dashboard + CRUD tables
- Editor forms with draft/publish toggle

## Accessibility
- keyboard navigable
- visible focus states
- alt text for images

## Venue cover behavior
- Venue managers can set a gallery image as the venue cover from `/my/venues/[id]` using **Set as cover**.
- The selected cover is visibly marked in the gallery manager.
- Venue index cards (`/venues`) use this cover image as the card hero image.
- Venue detail metadata (Open Graph image) prefers this cover image for sharing previews.

## Venue self-serve publishing flow

- `/my/venues/[id]` now includes a dedicated **Publishing** panel with status mapping:
  - `DRAFT` (or no submission): Draft
  - `IN_REVIEW`: Pending review
  - `REJECTED`: Needs changes
  - `APPROVED`/`isPublished=true`: Published
- Owners can submit using **Submit for review** when required fields pass server validation.
- Validation issues are surfaced inline before submission and from API responses:
  - Missing name
  - Description below minimum length
  - Missing cover image
  - Missing address basics (address line or city + country)
  - Invalid website URL (if provided)
- While pending review, the form remains editable and users are informed that a review is in progress.
- Once published, the panel links directly to the live `/venues/[slug]` page.

## Event self-serve publishing flow

- `/my/venues/[id]/submit-event` shows per-event publishing status:
  - Draft
  - Pending review
  - Needs changes
  - Published
- Venue members can submit each draft event for review from the same page.
- Event validation issues from the API are shown inline on the relevant event row.
- Reviewer feedback is shown for events in `Needs changes`.
- Authentication failures redirect users to `/login?next=...` and successful actions show toasts.
- Public event pages and venue event sections continue to display published events only.

## Published event revision workflow

- Published events remain live while venue members submit **revisions** for review.
- On `/my/venues/[id]/submit-event`:
  - Draft events continue using submit-to-publish flow.
  - Published events use **Propose edits** and create `REVISION` submissions.
  - Revision statuses are shown as `Live`, `Revision pending`, `Needs changes` (with reviewer feedback), and `Applied`.
- Admin approval of a revision applies the proposed changes atomically to the published event (without unpublishing it).
- Admin request-changes leaves the published event untouched and returns reviewer feedback to the member UI.

## Artist self-serve publishing flow

- `/my/artist` includes a **Publishing** panel mirroring venue/event workflows.
- Status mapping:
  - Draft (`DRAFT` or no submission)
  - Pending review (`IN_REVIEW`)
  - Needs changes (`REJECTED`, with reviewer feedback inline)
  - Published (`APPROVED` and/or `Artist.isPublished=true`)
- Artists submit with **Submit for review** (`POST /api/my/artist/submit`) and see inline readiness issues returned by the API.
- Once published, the panel links to the live `/artists/[slug]` page.
- Public `/artists` and `/artists/[slug]` remain published-only and do not expose draft artist profiles.

## Artist ↔ Venue association UX

### `/my/artist` additions
- New **Venues** panel lets artists:
  - Search/select from published venues
  - Choose association role (`represented_by`, `exhibited_at`, `resident_artist`, `collaborator`, `other`)
  - Add an optional request message
  - Submit association requests and see grouped statuses (`pending`, `approved`, `rejected`)
  - Cancel pending requests

### `/my/venues/[id]` additions
- New **Artist requests** panel for venue members:
  - Lists pending artist association requests with artist, role, and message
  - Approve or reject each request inline

- Public `/artists` and `/venues` now include shareable query-string discovery filters:
  - `assoc=any|verified|exhibitions|none`
  - `role=<association-role>` (applies only to `assoc=verified`)
- Filters are public/no-auth and run server-side with efficient relation existence checks (`some`/`none`) for verified associations and exhibition-derived associations.
- Discovery filter chips on `/artists` and `/venues` now show server-computed counts for `Any`, `Verified`, `Exhibitions`, and `None`.
- When `assoc=verified`, a secondary row of role facet chips appears with per-role counts plus `All roles` (verified total).
- Role facets are hidden outside verified mode and remain URL-shareable via `role=<association-role>` while counts stay UI-only.

### Public `/artists/[slug]`
- New **Associated venues** section with role badges and lightweight filter pills (`All`, role keys present, `Exhibitions`).
  - **Verified**: approved explicit associations to published venues with normalized role badges
  - **From exhibitions**: venues derived from published exhibitions marked as `Exhibition venue`
- Venue links are deduplicated by venue id across groups, with filtering done client-side against already-fetched data.

### Public `/venues/[slug]`
- New **Artists** section with role badges and lightweight filter pills (`All`, role keys present, `From exhibitions`).
  - **Verified**: approved explicit associations from `ArtistVenueAssociation` where the artist is published
  - **From exhibitions**: artists derived from `EventArtist` on published venue exhibitions (badge: `From exhibitions`)
- Artist links are deduplicated by artist id, with verified associations taking precedence and filtering done client-side.

