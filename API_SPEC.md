# API Spec — Artpulse (Next.js Route Handlers)

This spec describes the HTTP API implemented via Next.js route handlers under `app/api/**/route.ts`.

- Base path: `/api`
- Content-Type: `application/json`
- Authentication: session cookie (Auth.js / NextAuth)

---

## 1. Conventions

### 1.1 Error shape

All errors return:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Human readable message",
    "details": {"field": "explanation"}
  }
}
```

### 1.2 Pagination

Use cursor pagination where relevant:

- Request: `?cursor=<opaque>&limit=20`
- Response:

```json
{
  "items": [],
  "nextCursor": "..."
}
```

### 1.3 Publish rules

- Public endpoints return **published** entities only.
- Admin endpoints can access drafts.

### 1.4 Date/time

- Use ISO-8601 timestamps in UTC for API payloads.
- `timezone` is stored for display; clients can format accordingly.

---

## 2. Public Read APIs

### 2.1 Events search

`GET /api/events`

**Query params**
- `query` (string, optional) — keyword
- `from` (ISO date/datetime, optional)
- `to` (ISO date/datetime, optional)
- `lat` (number, optional)
- `lng` (number, optional)
- `radiusKm` (number, optional; default 25)
- `tags` (comma-separated slugs, optional)
- `venue` (venue slug, optional)
- `artist` (artist slug, optional)
- `cursor` (optional)
- `limit` (optional, default 20)

**Response 200**

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "...",
      "slug": "...",
      "startAt": "2026-02-09T18:00:00Z",
      "endAt": "2026-02-09T20:00:00Z",
      "timezone": "Europe/London",
      "venue": {"name": "...", "slug": "...", "city": "..."},
      "primaryImageUrl": "...",
      "tags": [{"name": "...", "slug": "..."}]
    }
  ],
  "nextCursor": null
}
```

### 2.2 Event detail

`GET /api/events/[slug]`

**Response 200** (see full doc in repo)

- 404 `not_found`

### 2.3 Venues list/search

`GET /api/venues`

### 2.3.1 Public page query params (`/venues` and `/artists`)

These are App Router page query params (not API endpoint params) used by public discovery lists:

- `assoc`: `any | verified | exhibitions | none` (default `any`)
- `role`: optional association role key (`represented_by | exhibited_at | resident_artist | collaborator | other`), applied only when `assoc=verified`

Examples:
- `/artists?assoc=verified&role=represented_by`
- `/venues?assoc=exhibitions`
- `/artists?assoc=none`

Notes:
- Discovery count chips (mode counts + verified role facet counts) are computed server-side for page rendering only and do not introduce new API params.
- Query params remain unchanged: only `assoc` and optional `role` are used to express filters in shareable URLs.

### 2.4 Venue detail

`GET /api/venues/[slug]`

### 2.5 Artists list/search

`GET /api/artists`

### 2.6 Artist detail

`GET /api/artists/[slug]`

### 2.7 Tags

`GET /api/tags`

---

## 3. Authenticated APIs

### 3.1 List favourites

`GET /api/favorites` (auth required)

### 3.2 Create favourite

`POST /api/favorites` (auth required)

### 3.3 Delete favourite

`DELETE /api/favorites/[id]` (auth required)

---

## 4. Admin / Editor APIs

All admin endpoints require role `EDITOR` or `ADMIN`.

- `POST /api/admin/events`
- `PATCH /api/admin/events/[id]`
- `DELETE /api/admin/events/[id]`
- `POST /api/admin/venues`
- `PATCH /api/admin/venues/[id]`
- `DELETE /api/admin/venues/[id]`
- `POST /api/admin/artists`
- `PATCH /api/admin/artists/[id]`
- `DELETE /api/admin/artists/[id]`

---

## 5. Validation Rules (summary)

- `slug` must be lowercase, hyphenated, unique
- `startAt` required; `endAt` optional but must be >= `startAt`
- `lat/lng` must be valid ranges if present
- URLs must be valid `http(s)` URLs

---

## 6. Security & Rate Limiting (MVP)

- Require auth for favourites and all admin endpoints
- Add basic rate limiting later if needed
- Prevent enumeration: keep IDs opaque and use slugs for public reads

---

## 3. Authenticated Venue Gallery APIs

All endpoints below require an authenticated session and venue membership.

### 3.1 Generate venue image upload token

`POST /api/my/venues/[id]/images/upload-url`

Uses Vercel Blob client-upload handshake and returns the Blob token payload required by `@vercel/blob/client`.

**Request body**

```json
{
  "type": "blob.generate-client-token",
  "payload": {
    "pathname": "venues/<venueId>/file.jpg",
    "clientPayload": "{\"fileName\":\"file.jpg\",\"contentType\":\"image/jpeg\",\"size\":12345}",
    "multipart": false,
    "callbackUrl": "..."
  }
}
```

**Response 200**

```json
{
  "type": "blob.generate-client-token",
  "clientToken": "..."
}
```

### 3.2 Create venue image record

`POST /api/my/venues/[id]/images`

**Request body**

```json
{
  "url": "https://...public.blob.vercel-storage.com/...",
  "key": "optional/blob/path",
  "alt": "Optional alt text"
}
```

**Response 201**

```json
{
  "image": {
    "id": "uuid",
    "url": "https://...",
    "alt": "Optional alt text",
    "sortOrder": 0
  }
}
```

### 3.3 Update venue image alt text

`PATCH /api/my/venues/images/[imageId]`

**Request body**

```json
{ "alt": "Updated alt text" }
```

**Response 200**

```json
{ "image": { "id": "uuid", "url": "...", "alt": "Updated alt text", "sortOrder": 0 } }
```

### 3.4 Reorder venue images

`PATCH /api/my/venues/[id]/images/reorder`

**Request body**

```json
{ "orderedIds": ["uuid-1", "uuid-2"] }
```

**Response 200**

```json
{ "ok": true }
```

### 3.5 Set venue cover image

`PATCH /api/my/venues/[id]/cover`

Use an existing venue gallery image as the venue cover used on public venue cards and share metadata.

**Request body**

```json
{ "imageId": "uuid" }
```

`venueImageId` is accepted as an alias for `imageId`.

**Response 200**

```json
{
  "cover": {
    "featuredAssetId": "uuid-or-null",
    "featuredImageUrl": "https://...or-null"
  }
}
```

If the selected venue image has an `assetId`, the API sets `featuredAssetId` and clears `featuredImageUrl`.
If it has no `assetId`, the API sets `featuredImageUrl` and clears `featuredAssetId`.

### 3.6 Delete venue image

`DELETE /api/my/venues/images/[imageId]`

**Response 200**

```json
{ "ok": true }
```

### 3.7 Errors

Error shape follows global conventions (`error.code` values include `invalid_request`, `unauthorized`, `forbidden`, `rate_limited`).

## 7. Venue Publish Workflow APIs

### 7.1 Submit venue for review

`POST /api/my/venues/[id]/submit` (auth + venue membership required)

**Request body**

```json
{
  "message": "Optional note to moderators"
}
```

**Response 200**

```json
{
  "submission": {
    "id": "uuid",
    "status": "IN_REVIEW",
    "createdAt": "2026-02-14T10:00:00.000Z"
  }
}
```

**Validation failure (400 invalid_request)**

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Venue is not ready for review",
    "details": {
      "issues": [
        { "field": "description", "message": "Description must be at least 50 characters" },
        { "field": "coverImage", "message": "Add a cover image before submitting" }
      ]
    }
  }
}
```

### 7.2 Approve venue submission

`POST /api/admin/submissions/[id]/approve` (editor/admin required)

Supports `VENUE`, `EVENT`, and `ARTIST` publish submissions. Also supports `EVENT` revision submissions (`kind="REVISION"`).

**Response 200**

```json
{ "ok": true }
```

### 7.3 Request changes on venue submission

`POST /api/admin/submissions/[id]/request-changes` (editor/admin required)

Supports `VENUE`, `EVENT`, and `ARTIST` publish submissions. Also supports `EVENT` revision submissions (`kind="REVISION"`).

**Request body**

```json
{ "message": "Please add opening hours and expand the venue description." }
```

**Response 200**

```json
{ "ok": true }
```

All endpoints return the standard error shape (`unauthorized`, `forbidden`, `invalid_request`, `rate_limited`) in `error.code`.

### 7.4 Submit event for review

`POST /api/my/venues/[venueId]/events/[eventId]/submit` (auth + venue membership required)

**Request body**

```json
{
  "message": "Optional note to moderators"
}
```

**Response 200**

```json
{
  "submission": {
    "id": "uuid",
    "status": "IN_REVIEW",
    "createdAt": "2026-02-14T10:00:00.000Z"
  }
}
```

**Validation failure (400 invalid_request)**

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Event is not ready for review",
    "details": {
      "issues": [
        { "field": "description", "message": "Description must be at least 50 characters" },
        { "field": "coverImage", "message": "Add at least one event image before submitting" }
      ]
    }
  }
}
```

### 7.5 Create event revision for published event

`POST /api/my/venues/[venueId]/events/[eventId]/revisions` (auth + venue membership required)

Used for published events. This creates a moderation submission with `kind="REVISION"` and stores the proposed event snapshot in `submission.details.proposed`.

**Request body**

```json
{
  "patch": {
    "title": "Optional edited title",
    "description": "Optional edited description",
    "startAt": "2026-03-01T19:00:00.000Z",
    "endAt": "2026-03-01T21:00:00.000Z",
    "ticketUrl": "https://tickets.example.com/new"
  },
  "message": "Optional note to reviewer"
}
```

**Response 200**

```json
{
  "revisionSubmission": {
    "id": "uuid",
    "status": "IN_REVIEW",
    "createdAt": "2026-02-25T10:00:00.000Z"
  }
}
```

### 7.6 Read latest event revision status

`GET /api/my/venues/[venueId]/events/[eventId]/revisions/latest` (auth + venue membership required)

**Response 200**

```json
{
  "revisionSubmission": {
    "id": "uuid",
    "status": "REJECTED",
    "createdAt": "2026-02-25T10:00:00.000Z",
    "reviewedAt": "2026-02-25T12:00:00.000Z",
    "reviewerMessage": "Please tighten the description and fix the date range."
  }
}
```

Admin moderation endpoints (`/api/admin/submissions/[id]/approve` and `/api/admin/submissions/[id]/request-changes`) handle `VENUE`, `ARTIST`, `EVENT` publish submissions and `EVENT` revision submissions (`kind="REVISION"`).

## 3. Authenticated Artist Self-Serve APIs

All endpoints below require an authenticated session and ownership of `Artist.userId`.

### 3.1 Generate artist image upload token

`POST /api/my/artist/images/upload`

Uses Vercel Blob client-upload handshake and returns the Blob token payload required by `@vercel/blob/client`.

### 3.2 Create artist image record

`POST /api/my/artist/images`

Request body:

```json
{
  "url": "https://...public.blob.vercel-storage.com/...",
  "alt": "Optional alt text",
  "assetId": "optional-uuid"
}
```

### 3.3 Reorder artist images

`PATCH /api/my/artist/images/reorder`

Request body:

```json
{
  "orderedIds": ["uuid", "uuid"]
}
```

### 3.4 Update artist image metadata

`PATCH /api/my/artist/images/[imageId]`

Request body:

```json
{
  "alt": "New alt text"
}
```

### 3.5 Delete artist image

`DELETE /api/my/artist/images/[imageId]`

### 3.6 Set artist cover image

`PATCH /api/my/artist/cover`

Request body:

```json
{
  "imageId": "uuid"
}
```

Cover precedence mirrors venue behavior:
- image has `assetId` -> `featuredAssetId=assetId`, `featuredImageUrl=null`
- image has no `assetId` -> `featuredAssetId=null`, `featuredImageUrl=image.url`

### 3.7 Update my artist profile

`PATCH /api/my/artist`

Request body supports partial profile fields:
- `name`
- `bio`
- `websiteUrl`
- `instagramUrl`
- `avatarImageUrl`


### 3.8 Submit my artist profile for review

`POST /api/my/artist/submit` (auth + `Artist.userId` ownership required)

Request body:

```json
{
  "message": "Optional note to moderators"
}
```

Response 200:

```json
{
  "submission": {
    "id": "uuid",
    "status": "IN_REVIEW",
    "createdAt": "2026-02-14T10:00:00.000Z"
  }
}
```

Validation failure (400 invalid_request):

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Artist profile is not ready for review",
    "details": {
      "issues": [
        { "field": "bio", "message": "Artist statement must be at least 50 characters" },
        { "field": "coverImage", "message": "Add a cover image before submitting" }
      ]
    }
  }
}
```

### 3.9 Request artist ↔ venue association

`POST /api/my/artist/venues/request` (auth + `Artist.userId` ownership required)

Request body:

```json
{
  "venueId": "uuid",
  "role": "represented_by",
  "message": "Optional context for venue staff"
}
```

Role keys are normalized to: `represented_by | exhibited_at | resident_artist | collaborator | other`.
Synonyms like `represented` and `exhibition` are accepted. Unknown values normalize to `other`, and empty/missing values normalize to `exhibited_at`.

Response 200:

```json
{
  "association": {
    "id": "uuid",
    "status": "PENDING",
    "role": "represented_by",
    "venueId": "uuid"
  }
}
```

### 3.10 List my artist venue associations

`GET /api/my/artist/venues`

Response 200 grouped by status:

```json
{
  "pending": [],
  "approved": [],
  "rejected": []
}
```

### 3.11 Cancel pending artist venue association request

`DELETE /api/my/artist/venues/[associationId]`

Response 200:

```json
{ "ok": true }
```

### 3.12 List pending artist requests for a venue

`GET /api/my/venues/[id]/artist-requests` (auth + venue membership required)

Response 200:

```json
{
  "requests": [
    {
      "id": "uuid",
      "role": "represented_by",
      "message": "Optional message",
      "artist": {
        "id": "uuid",
        "name": "Artist name",
        "slug": "artist-slug",
        "cover": "https://..."
      }
    }
  ]
}
```

### 3.13 Approve artist request for a venue

`POST /api/my/venues/[id]/artist-requests/[associationId]/approve`

Response 200:

```json
{
  "association": {
    "id": "uuid",
    "status": "APPROVED"
  }
}
```

### 3.14 Reject artist request for a venue

`POST /api/my/venues/[id]/artist-requests/[associationId]/reject`

Response 200:

```json
{
  "association": {
    "id": "uuid",
    "status": "REJECTED"
  }
}
```
