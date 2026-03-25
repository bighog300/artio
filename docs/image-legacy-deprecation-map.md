# Sprint 6 — Legacy Image Field Deprecation Map

This map tracks flat image fields and compatibility upload routes that still exist while the centralized asset pipeline rollout is completed.

## Legacy/Transitional response fields

| Field / pattern | Current status | Notes |
| --- | --- | --- |
| `imageUrl` | Transitional / deprecated | Still returned or consumed by older list cards and admin surfaces. New endpoints should expose `image` (`ApiImageField`) first. |
| `thumbUrl` | Transitional / deprecated | Retained on asset endpoints for older thumbnail consumers. |
| `primaryImageUrl` | Still actively required | Public venues/events responses still expose this for existing clients; should be removed after all clients read `image`. |
| `coverUrl` | Transitional / deprecated | Retained in artwork/profile payloads and UI props; use structured `image` / `coverImage` first. |
| `avatarImageUrl` | Still actively required | Artist/profile surfaces still rely on this field for compatibility. |
| direct `featuredAsset.url` reads | Removable after migration | New work should use `resolveAssetDisplay` / `resolveEntityPrimaryImage` to avoid bypassing variants and diagnostics. |

### Confirmed removals in this sprint

- Removed redundant `imageUrl` response aliases from admin ingest image import/approval/merge endpoints after migrating admin consumers to structured `image` reads:
  - `POST /api/admin/ingest/artists/[id]/import-image`
  - `POST /api/admin/ingest/artworks/[id]/import-image`
  - `POST /api/admin/ingest/artworks/[id]/approve`
  - `POST /api/admin/ingest/artworks/[id]/merge`
- Added direct contract assertions for structured `image` on admin ingest artwork approve/merge paths and admin branding logo GET success path.

## Compatibility upload paths

| Route / helper | Classification | Notes |
| --- | --- | --- |
| `/api/uploads/image` | Compatibility wrapper only | Legacy file upload entrypoint retained for backward compatibility; new work should use asset pipeline routes. |
| `/api/admin/blob/upload` | Compatibility wrapper only | Old admin upload client wrapper retained while admin clients migrate. |
| `lib/my-artist-images-route.ts` handshake helpers | Still actively required | Venue/artist self-serve token handshakes are still used and intentionally retained. |
| `lib/my-venue-images-route.ts` handshake helpers | Still actively required | Venue self-serve upload handshakes remain part of active flows. |

## Removal guidance

- Remove flat fields only after consumers are confirmed to read `image` / `coverImage`.
- Keep compatibility wrappers stable until all callers migrate to centralized upload/process routes.
- Prefer converting direct image URL access to resolver-backed helpers before deleting compatibility fields.
