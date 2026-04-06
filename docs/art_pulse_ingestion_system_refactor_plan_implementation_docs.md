# ArtPulse Ingestion System Refactor Plan (Implementation Docs)

## Purpose

This document provides a **step-by-step implementation blueprint** to refactor the existing ingestion and discovery system into the new Gallery-First Pipeline (v2).

It is designed for direct execution by engineers or Codex.

---

# 1. Target Architecture Overview

## From → To

**Current:**
- Event-first ingestion
- Inline async enrichment
- Weak retry + observability

**Target:**
- Gallery-first ingestion
- Strategy-based extraction
- Queue-driven architecture
- Continuous sync + learning

---

# 2. New System Components

## Core Modules

```
/ingestion
  /gallery
  /strategies
  /crawler
  /jobs
  /workers
  /matching
  /normalisation
  /metrics
```

---

# 3. Database Changes

## 3.1 GallerySource

Create new model:

```ts
GallerySource {
  id: string
  name: string
  rootUrl: string
  whatsOnUrl?: string
  artistsUrl?: string

  platformType: string
  extractionStrategy: string

  healthScore: number
  lastIngestedAt?: Date
}
```

---

## 3.2 GalleryPage

```ts
GalleryPage {
  id: string
  galleryId: string
  url: string
  type: string
  priority: number
  contentHash?: string
}
```

---

## 3.3 DirectorySource

```ts
DirectorySource {
  id: string
  name: string
  rootUrl: string
  indexPattern: string
  type: string
}
```

---

## 3.4 DirectoryCursor

```ts
DirectoryCursor {
  sourceId: string
  currentLetter?: string
  currentPage?: number
}
```

---

## 3.5 IngestMetrics

```ts
IngestMetrics {
  id: string
  galleryId: string

  pagesDiscovered: number
  eventsExtracted: number
  artistsExtracted: number
  artworksExtracted: number

  successRate: number
  failureRate: number
}
```

---

# 4. Job Queue System

## 4.1 Setup

Introduce queue system (BullMQ recommended)

## 4.2 Job Types

```
- crawl-gallery
- crawl-page
- extract-page
- enrich-artist
- enrich-artwork
- process-images
- auto-tag
- directory-page
- entity-page
```

---

## 4.3 Job Payload Example

```ts
{
  type: 'crawl-page',
  url: string,
  galleryId: string
}
```

---

## 4.4 Requirements

- retries (3–5 attempts)
- exponential backoff
- idempotency keys
- structured logging

---

# 5. Extraction Strategy System

## 5.1 Interface

```ts
interface ExtractionStrategy {
  discoverPages(gallery): Promise<GalleryPage[]>
  extract(page): Promise<ExtractionResult>
}
```

---

## 5.2 Strategy Registry

```ts
const strategies = {
  wordpress,
  squarespace,
  wix,
  custom,
  aiFallback
}
```

---

# 6. Crawler System

## 6.1 Responsibilities

- fetch pages
- respect rate limits
- enqueue extraction jobs

---

## 6.2 Rate Limiting

```ts
perDomain: {
  maxConcurrency: 1,
  delay: 2000–5000ms
}
```

---

## 6.3 Crawl Flow

```
crawl-gallery → discover pages → enqueue crawl-page
crawl-page → fetch HTML → enqueue extract-page
```

---

# 7. Extraction Pipeline

## 7.1 Output Structure

```ts
ExtractionResult {
  events: Event[]
  artists: Artist[]
  artworks: Artwork[]
}
```

---

## 7.2 Rules

- extract relationships in one pass
- attach artists + artworks to events

---

# 8. Matching & Normalisation

## 8.1 Artist Matching

- lowercase
- remove punctuation
- fuzzy match

## 8.2 Deduplication

- hash (name + context)
- similarity scoring

---

# 9. Directory Mining System

## 9.1 Flow

```
directory-source → generate A–Z URLs → enqueue directory-page
→ extract links → enqueue entity-page
```

---

## 9.2 Safeguards

- delay + jitter
- resume via cursor
- dedupe URLs

---

# 10. Enrichment Pipeline

## 10.1 Jobs

- artist enrichment
- artwork enrichment
- tagging

## 10.2 Data Sources

- AI APIs
- search APIs
- scraped pages

---

# 11. Continuous Sync

## 11.1 Scheduler

```
cron → enqueue crawl-gallery
```

## 11.2 Frequency

- 6–24 hours per gallery

---

# 12. Observability

## 12.1 Logging

- job-level logs
- structured JSON logs

## 12.2 Metrics

- ingestion success rate
- failure reasons
- extraction counts

---

# 13. Refactor Execution Plan

## Phase 1: Foundation
- add new DB models
- introduce job queue

## Phase 2: Crawler
- build crawl system
- implement rate limiting

## Phase 3: Strategies
- implement WordPress strategy
- implement DOM strategy
- add AI fallback

## Phase 4: Extraction
- unify extraction output
- connect to DB upsert

## Phase 5: Directory Mining
- implement A–Z crawler
- integrate with pipeline

## Phase 6: Enrichment
- move all async work to jobs

## Phase 7: Metrics + Learning
- add ingest metrics
- track failures

---

# 14. Migration Strategy

## Step 1
Run new pipeline in parallel with existing system

## Step 2
Compare outputs

## Step 3
Gradually switch ingestion sources

## Step 4
Deprecate old ingestion routes

---

# 15. Definition of Done

- all ingestion runs through queue
- gallery-first pipeline active
- directory mining operational
- retry + logging in place
- metrics visible

---

End of document.

