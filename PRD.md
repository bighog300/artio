# Product Requirements Document (PRD) — Artpulse

## 1. Overview

**Artpulse** is a web application for discovering, publishing, and following art-related events. It connects **art audiences**, **artists**, and **venues** (galleries, museums, pop-up spaces) through a location-aware, calendar-driven experience.

The MVP focuses on high-quality event discovery and publishing, not social networking.

---

## 2. Vision & Goals

### Vision

Become the default place to answer: *“What art exhibitions, openings, and events are happening near me?”*

### Product goals (MVP)

- Make art events easy to discover by **location and date**
- Provide clean, editorial-quality event pages
- Allow venues and artists to self-publish events
- Support calendar-based planning
- Deploy cleanly on Vercel with minimal ops overhead

### Non-goals (MVP)

- Ticket sales or payments
- Messaging or social feeds
- Recommendation algorithms beyond basic filters

---

## 3. User Types

### 1. Visitor / Art Fan

- Wants to discover exhibitions and events nearby
- Browses by date, location, venue, or artist
- Saves favourites for later reference

### 2. Venue (Gallery / Museum)

- Publishes exhibitions and events
- Maintains a venue profile
- Wants visibility to local audiences

### 3. Artist

- Maintains a public profile
- Lists exhibitions, openings, and talks
- Links out to personal sites and social profiles

### 4. Editor / Admin

- Curates and moderates content
- Manages featured events
- Ensures quality and consistency

---

## 4. Core User Journeys (MVP)

### A. Discover an event

1. User lands on home page
2. Sees upcoming events near their location
3. Applies filters (date, category, distance)
4. Clicks an event
5. Views full event details and venue location

### B. Browse by venue or artist

1. User opens a venue or artist page
2. Sees profile information
3. Views upcoming and past events

### C. Save favourites

1. User signs in
2. Clicks “Save” on an event / venue / artist
3. Views saved items in account area

### D. Publish an event (admin/editor)

1. Admin signs in
2. Creates or edits an event
3. Saves as draft or publishes
4. Event appears in public listings

---

## 5. Feature Scope

### 5.1 Event Discovery

- Event list view (chronological)
- Calendar view (month / week / list)
- Map view (optional in MVP)
- Search by keyword
- Filters:
  - Date range
  - Location radius
  - Free / paid (text-based)
  - Tags / categories

### 5.2 Event Pages

- Title, description
- Date/time range
- Venue and map location
- Images (poster / exhibition images)
- Ticket or info link
- Tags
- iCal export

### 5.3 Venue Pages

- Venue profile
- Address and map
- Website and social links
- List of events

### 5.4 Artist Pages

- Artist bio
- Links
- Associated events
- Optional image/avatar

### 5.5 Accounts & Auth

- Sign in with Google or email magic link
- Save favourites
- Minimal profile (name, email)

### 5.6 Admin / Editorial Tools

- CRUD for events, venues, artists
- Draft / published state
- Basic moderation (unpublish)

---

## 6. Content Rules

- Only **published** content appears publicly
- Drafts visible only to editors/admins
- Past events remain visible but are marked as past

---

## 7. Success Metrics

- Number of published events
- Event detail page views
- Saved favourites per user
- Weekly active users
- Returning users within 30 days

---

## 8. Accessibility & UX Requirements

- Mobile-first layout
- Keyboard-accessible navigation
- Accessible calendar controls
- Readable typography and contrast

---

## 9. Technical Constraints

- Must deploy cleanly on Vercel
- Must support server-side rendering for SEO
- Database access via Prisma
- No background jobs required for MVP

---

## 10. Future (Post-MVP)

- Editorial articles / art news
- Featured events
- Advanced recommendations
- Multi-city support
- Native mobile app
