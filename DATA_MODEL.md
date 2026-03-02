# Data Model — Artpulse

This document defines the MVP data model for Artpulse. It is designed to map cleanly to Prisma + Postgres.

---

## 1. Core Entities

### 1.1 User

Represents an authenticated account.

**Fields**
- `id` (uuid)
- `email` (unique)
- `name` (optional)
- `imageUrl` (optional)
- `role` enum: `USER | EDITOR | ADMIN`
- `createdAt`
- `updatedAt`

**Notes**
- MVP stores minimal PII.
- Roles gate admin/editor actions.

---

### 1.2 Venue

Represents a gallery, museum, or other location.

**Fields**
- `id` (uuid)
- `name`
- `slug` (unique)
- `description` (optional)
- `addressLine1` (optional)
- `addressLine2` (optional)
- `city` (optional)
- `region` (optional)
- `country` (optional)
- `postcode` (optional)
- `lat` (optional, float)
- `lng` (optional, float)
- `websiteUrl` (optional)
- `instagramUrl` (optional)
- `contactEmail` (optional)
- `featuredAssetId` (optional, UUID)
- `featuredImageUrl` (optional, legacy URL fallback)
- `isPublished` (boolean, default false)
- `createdAt`
- `updatedAt`

**Relationships**
- Venue `hasMany` Events
- Venue `belongsTo` Asset (optional featured cover)

**Cover image precedence**
- Public venue cards and share metadata use: `featuredAsset.url` first, then `featuredImageUrl`.
- Setting a venue cover from gallery writes one of these fields:
  - if selected `VenueImage.assetId` exists: set `featuredAssetId`, clear `featuredImageUrl`
  - otherwise: set `featuredImageUrl`, clear `featuredAssetId`


- Venue `hasMany` VenueImage

---

### 1.3 Artist

Represents an artist profile.

**Fields**
- `id` (uuid)
- `name`
- `slug` (unique)
- `bio` (optional)
- `websiteUrl` (optional)
- `instagramUrl` (optional)
- `avatarImageUrl` (optional)
- `isPublished` (boolean, default false)
- `createdAt`
- `updatedAt`

**Relationships**
- Artist `manyToMany` Events (via EventArtist)

---

### 1.4 Event

Represents an art event: opening, exhibition, talk, workshop, fair, etc.

**Fields**
- `id` (uuid)
- `title`
- `slug` (unique)
- `description` (optional)
- `startAt` (datetime)
- `endAt` (datetime, optional)
- `timezone` (string, e.g. `Europe/London`)
- `eventType` enum (optional): `EXHIBITION | OPENING | TALK | WORKSHOP | FAIR | OTHER`
- `ticketUrl` (optional)
- `priceText` (optional)
- `isFree` (optional boolean)
- `organizerName` (optional)
- `venueId` (optional) — supports pop-up events
- `lat` (optional, float) — for non-venue events
- `lng` (optional, float)
- `isPublished` (boolean, default false)
- `publishedAt` (optional datetime)
- `createdAt`
- `updatedAt`

**Relationships**
- Event `belongsTo` Venue (optional)
- Event `hasMany` EventImage
- Event `manyToMany` Tags (via EventTag)
- Event `manyToMany` Artists (via EventArtist)

---

### 1.5 Tag

Taxonomy for events (e.g. “Photography”, “Sculpture”, “Free Entry”).

**Fields**
- `id` (uuid)
- `name` (unique)
- `slug` (unique)
- `createdAt`

**Relationships**
- Tag `manyToMany` Events (via EventTag)

---

### 1.6 EventImage

Stores one or more images for an event.

**Fields**
- `id` (uuid)
- `eventId`
- `url`
- `alt` (optional)
- `sortOrder` (int, default 0)
- `createdAt`

**Relationships**
- EventImage `belongsTo` Event

---

### 1.7 VenueImage

Stores one or more gallery images for a venue.

**Fields**
- `id` (uuid)
- `venueId`
- `assetId` (optional)
- `url`
- `alt` (optional)
- `sortOrder` (int, default 0)
- `createdAt`

**Relationships**
- VenueImage `belongsTo` Venue
- VenueImage `belongsTo` Asset (optional)

---

### 1.8 Favorite

Allows a user to save an event, venue, or artist.

**Fields**
- `id` (uuid)
- `userId`
- `targetType` enum: `EVENT | VENUE | ARTIST`
- `targetId` (uuid)
- `createdAt`

**Constraints**
- Unique composite: (`userId`, `targetType`, `targetId`)

---

## 2. Join Tables

### 2.1 EventTag

**Fields**
- `eventId`
- `tagId`

**Constraints**
- Unique composite: (`eventId`, `tagId`)

---

### 2.2 EventArtist

**Fields**
- `eventId`
- `artistId`
- `role` (optional, string: e.g. “Speaker”, “Exhibiting Artist”)

**Constraints**
- Unique composite: (`eventId`, `artistId`)

---

## 3. Optional (MVP-lite) Editorial

### 3.1 EditorialPost (optional)

If included in MVP, keep it minimal.

**Fields**
- `id` (uuid)
- `title`
- `slug` (unique)
- `body` (markdown)
- `coverImageUrl` (optional)
- `isPublished` (boolean)
- `publishedAt` (optional)
- `createdAt`
- `updatedAt`

---

## 4. Publishing Rules

- Public pages only show `isPublished = true` records.
- Events may be shown after end date, but marked as past.
- `publishedAt` is set when transitioning draft → published.

---

## 5. Geo & Search (MVP)

- Prefer venue coordinates as event coordinates when `venueId` is present.
- For pop-ups, use Event `lat/lng`.
- Radius search:
  - Bounding box filter first
  - Distance refinement second

---

## 6. Prisma Mapping Notes

- Use `@@index` on:
  - `Event.startAt`
  - `Event.isPublished`
  - `Venue.isPublished`
  - `Artist.isPublished`
  - `Event.venueId`
- Use unique constraints for slugs.
- Favourites should enforce uniqueness to avoid duplicates.

---

## 4. Moderation Submission Workflow

`Submission` records are reused for venue, event, and artist moderation.

- `Submission.type`: `VENUE | EVENT | ARTIST`
- `Submission.kind`: `PUBLISH | REVISION` (`REVISION` currently used for published event edits)
- `Submission.status`: `DRAFT | IN_REVIEW | APPROVED | REJECTED`
- `targetArtistId` links artist publish submissions to `Artist`

Publishing rule for artists:
- Public artist pages query `Artist.isPublished = true` only.
- Admin approval of an artist `PUBLISH` submission sets `Artist.isPublished=true`.
- Admin request-changes keeps `Artist.isPublished=false` and stores reviewer feedback on the submission.

### 2.3 ArtistVenueAssociation

Explicit association between an artist profile and a venue, independent from EventArtist-derived relationships.

**Fields**
- `id` (uuid)
- `artistId` (uuid)
- `venueId` (uuid)
- `role` (optional enum-like string: `represented_by | exhibited_at | resident_artist | collaborator | other`)
- `status` (`PENDING | APPROVED | REJECTED`)
- `message` (optional requester note)
- `requestedByUserId` (optional uuid)
- `reviewedByUserId` (optional uuid)
- `reviewedAt` (optional datetime)
- `createdAt`
- `updatedAt`

**Constraints**
- Unique composite: (`artistId`, `venueId`) so each pair has at most one active record
- Indexes: (`venueId`, `status`, `createdAt`) and (`artistId`, `status`, `createdAt`)

**Semantics**
- Artists can request associations to published venues.
- Venue members approve/reject incoming requests.
- Legacy/unknown incoming role strings are normalized to `other`; empty roles default to `exhibited_at`.
- Public artist pages display approved associations (verified) plus derived venues from published events.
- Public venue pages display approved associations (verified artists) from `ArtistVenueAssociation` plus derived artists from `EventArtist` rows on published events.
