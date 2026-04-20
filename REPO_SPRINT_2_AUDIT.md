# Sprint 2 Repo Audit (Gallery Product + Discovery Upgrade)

## 1) Current artwork/content models

## Core user-facing content models in Prisma
- `Artwork`: standalone published artwork entity with artist ownership, media, and metadata (`title`, `description`, `medium`, `year`, pricing, etc.).
- `Collection`: user-owned grouping container with `title`, `description`, `isPublic` and `CollectionItem[]`.
- `CollectionItem`: polymorphic membership model; supports `EVENT`, `ARTIST`, `VENUE`, `ARTWORK`.
- `CollectionFollow`: allows users to follow/save a collection.
- `CuratedCollection` + `CuratedCollectionItem`: editorial artwork-only rails used on home/artwork surfaces.
- `Favorite`: generic save/bookmark model for `EVENT`, `VENUE`, `ARTIST`, `ARTWORK`.

## Existing gallery-like models (important distinction)
- `GallerySource` and `GalleryPage` already exist but are ingestion/crawl infrastructure tied to venue source crawling; they are **not** a user-facing gallery product model.

## 2) Current discovery feed implementation

## Main discovery/recommendation paths
- `/for-you` uses `/api/recommendations/for-you` + `lib/recommendations-for-you.ts`.
- Current payload is event-centric (`items[].event`) with event scoring from follows, social saves/collections, saved searches, location proximity, promotions, and engagement feedback.
- UI (`components/recommendations/for-you-client.tsx`) only renders `EventCard` items grouped by reason category.

## Other discovery surfaces
- Home page (`app/page.tsx`) has separate rails: curated collections, network/trending collections, trending events, trending artworks.
- Artwork browsing (`/artwork`) is artwork-first and does not model galleries as first-class product objects.

## 3) Current save/favorite implementation

- Entity save/un-save for supported targets goes through `/api/favorites` and `FavoriteTargetType`.
- Collection save/follow flow exists through `/api/collections/[id]/follow` and `CollectionFollow`.
- Existing user-facing save button infra (`components/saves/save-button.tsx`) does not include a gallery type, but collection follow endpoints already provide gallery-save-equivalent behavior.

## 4) Current search implementation

- Main `/search` page currently returns **events only**.
- Query parsing uses `eventsQuerySchema` and renders `SearchResultsList` with `EventCard` only.
- No segmented/tabbed entity search for galleries or creators currently.

## 5) Gallery model decision

## Decision
**Use existing `Collection` as the user-facing Gallery abstraction** (Sprint 2), rather than introducing a new `Gallery` database model.

## Rationale
- The repository already has robust grouping + follow/save primitives (`Collection`, `CollectionItem`, `CollectionFollow`) and public collection rendering.
- Gallery save flow can map directly to existing collection-follow behavior without schema migrations or duplicate save systems.
- This is the simplest robust path for Sprint 2 scope while preserving architecture and minimizing migration risk.
- `GallerySource`/`GalleryPage` are not suitable as user-facing products and should remain ingestion-focused.

## 6) Sprint 2 gap analysis

## Implemented
- Persistent save/follow mechanics for grouped content via `CollectionFollow`.
- Existing collection APIs and collection detail rendering path.
- Event recommendation engine already uses behavior signals (follows, clicks/feedback, saves/social saves, collection relationships).

## Partial
- Collections are not branded/positioned as first-class **Galleries** in primary user experience.
- Discovery has events + collection rails, but not an intentional mixed discovery feed model with shared ranking surfacing.
- Recommendations use behavior signals but are currently event-only in surfaced feed payload/UI.

## Missing
- Dedicated gallery list route.
- Dedicated gallery detail route with gallery-specific UX (hero, curator/creator block, ordered sequence narrative framing).
- Gallery card type reusable across discovery surfaces.
- Explicit gallery save CTA in gallery-specific UI.
- Segmented/tabbed search for events + galleries + creators (and venues where supported).
- Sprint-2 validation checklist statusing tied to acceptance criteria.

## Blockers
- None identified at audit stage.
