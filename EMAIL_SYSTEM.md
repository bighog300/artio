# Email System — Implementation Guide

> **Status:** Not started  
> **Provider:** Resend  
> **Delivery:** 10 weeks, one Codex session per week  
> **Reference plan:** `artpulse-codex-upgrade-bundle/docs/` (email system plan, March 2026)

---

## Critical bug — fix before anything else

`lib/venue-claims/service.ts` currently enqueues venue claim verification with `type: INVITE_CREATED` but a payload of `{ type: 'VENUE_CLAIM_VERIFY' }`. This means `buildNotification()` throws `notification_template_payload_mismatch` for every venue claim submitted. Fix this in **Week 3 (task B4)** before any provider is wired.

---

## Architecture overview

```
NotificationOutbox (existing table)
        │
        ▼
outbox cron  →  outbox worker  →  renderEmailTemplate()  →  Resend API
(/api/cron/outbox/send)               (lib/email/render.ts)
        │
        └── Also handles BROADCAST rows for admin campaigns (Area C)
```

All email — transactional, digest, and broadcast campaign — flows through the single existing `NotificationOutbox` table and outbox worker. No second queue or worker is needed.

---

## Environment variables

Add all of these to `ENVIRONMENT.md` and `scripts/check-env.mjs`:

| Variable | Required in prod | Purpose |
|---|---|---|
| `RESEND_API_KEY` | Yes | Resend API authentication |
| `RESEND_FROM_ADDRESS` | Yes | Default from address e.g. `Artpulse <noreply@mail.artpulse.co>` |
| `RESEND_WEBHOOK_SECRET` | Yes | Verify signature on POST `/api/webhooks/resend` |
| `UNSUBSCRIBE_TOKEN_SECRET` | Yes | HMAC secret for unsubscribe link tokens — **never rotate**, rotating invalidates all existing unsubscribe links |

---

## File map

```
lib/
  email/
    client.ts                     # Lazy Resend singleton
    render.ts                     # Dispatcher: NotificationType → renderAsync()
    audience.ts                   # Campaign audience segment resolver
    unsubscribe-token.ts          # HMAC-SHA256 token generation + verification
    templates/
      _layout.tsx                 # Shared header/footer wrapper (CAN-SPAM compliant)
      venue-invite.tsx
      submission-submitted.tsx
      submission-approved.tsx
      submission-rejected.tsx
      saved-search-match.tsx
      weekly-digest.tsx
      venue-claim-verify.tsx
      venue-claim-approved.tsx
      venue-claim-rejected.tsx
      rsvp-confirmation.tsx
      rsvp-cancellation.tsx
      event-change.tsx
      event-reminder-24h.tsx
      new-user-welcome.tsx
      broadcast.tsx

app/
  unsubscribe/
    page.tsx                      # Public unsubscribe page (no auth)
  api/
    webhooks/
      resend/
        route.ts                  # Delivery/open/bounce webhook handler
    admin/
      email/
        campaigns/
          route.ts                # GET list, POST create
          [id]/
            route.ts              # PATCH update, DELETE (DRAFT only)
            send/
              route.ts            # POST — resolve audience, enqueue, set SENDING
  (admin)/
    admin/
      settings/
        email-settings-client.tsx # New email section (enable toggle, from address, batch size)
      ops/
        email/
          page.tsx                # Outbox monitoring (PENDING/SENT/FAILED counts + retry)
      email/
        page.tsx                  # Campaign list
        new/
          page.tsx                # Campaign editor
        [id]/
          page.tsx                # Campaign editor (edit)
          report/
            page.tsx              # Post-send delivery report
```

---

## Week 1 — Foundation (A1–A4)

**Goal:** Get one real email actually delivering end-to-end.

### Install packages

```bash
pnpm add resend @react-email/components react-email
```

### Files to create / modify

**`lib/email/client.ts`** — new file

```ts
import { Resend } from 'resend';

let _resend: Resend | null = null;

export function getResendClient(): Resend {
  if (process.env.NODE_ENV === 'test') {
    throw new Error('Resend client must not be called in tests. Use a mock.');
  }
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set');
  }
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}
```

**`lib/outbox-worker.ts`** — replace the `console.log` in the deliver block

The current deliver block (inside `try { await withSpan('outbox:deliver', ...) }`) contains only a `console.log`. Replace it with:

```ts
const { subject, html, text } = await renderEmailTemplate(
  notification.type,
  notification.payload as NotificationTemplatePayload,
);

const fromAddress =
  (await getSiteSettings()).emailFromAddress ??
  process.env.RESEND_FROM_ADDRESS ??
  'Artpulse <noreply@mail.artpulse.co>';

const resend = getResendClient();
await resend.emails.send({
  from: fromAddress,
  to: notification.toEmail,
  subject,
  html,
  text,
  tags: [{ name: 'type', value: notification.type }],
});
```

`renderEmailTemplate` is defined in `lib/email/render.ts` (Week 3). For Week 1, create a stub that handles one type to prove end-to-end delivery works.

**`ENVIRONMENT.md`** — add `RESEND_API_KEY` and `RESEND_FROM_ADDRESS` to the required variables section.

**`scripts/check-env.mjs`** — add `RESEND_API_KEY` to the `PRODUCTION_REQUIRED` array alongside `AUTH_SECRET`.

### Verification

Send a test notification manually via `pnpm ts-node` or the admin outbox dry-run. Confirm the email lands in an inbox before proceeding to Week 2.

---

## Week 2 — Reliability (A5–A7, A9)

**Goal:** Retry logic, cron frequency fix, DNS setup.

### Migration — add retry fields to NotificationOutbox

Create `prisma/migrations/YYYYMMDD_outbox_retry_fields/migration.sql`:

```sql
ALTER TABLE "NotificationOutbox"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextRetryAt"  TIMESTAMPTZ;
```

Update `prisma/schema.prisma`:

```prisma
model NotificationOutbox {
  // ... existing fields
  attemptCount Int       @default(0)
  nextRetryAt  DateTime?
}
```

Run `pnpm prisma:generate` after schema change.

### Update the outbox worker

**`lib/outbox-worker.ts`** — three changes:

**1. Stuck-PROCESSING recovery** — add at the very top of `sendPendingNotificationsWithDb`, before the `findMany`:

```ts
// Reset PROCESSING rows stuck for > 10 minutes (worker crash recovery)
await db.notificationOutbox.updateMany({
  where: {
    status: 'PROCESSING',
    createdAt: { lte: new Date(Date.now() - 10 * 60 * 1000) },
  },
  data: { status: 'PENDING' },
});
```

**2. Update the findMany query** to respect `nextRetryAt`:

```ts
where: {
  status: 'PENDING',
  OR: [
    { nextRetryAt: null },
    { nextRetryAt: { lte: new Date() } },
  ],
},
```

**3. Update the failure handler** to set backoff:

```ts
const BACKOFF_MS = [60_000, 300_000, 1_800_000]; // 1m, 5m, 30m
const attempt = notification.attemptCount + 1;
const backoff = BACKOFF_MS[attempt - 1] ?? null; // null = permanent failure after 4 attempts

await db.notificationOutbox.updateMany({
  where: { id: notification.id, status: 'PROCESSING' },
  data: {
    status: backoff ? 'PENDING' : 'FAILED',
    errorMessage: message,
    attemptCount: attempt,
    nextRetryAt: backoff ? new Date(Date.now() + backoff) : null,
  },
});
```

### vercel.json — change outbox cron frequency

```json
{ "path": "/api/cron/outbox/send", "schedule": "*/5 * * * *" }
```

The digest cron (`20 2 * * *`) stays unchanged — it is a separate route.

### DNS (ops task)

Use the Resend dashboard to generate SPF, DKIM, and DMARC DNS records for the sending domain (e.g. `mail.artpulse.co`). Set DMARC to `p=none` initially to monitor without blocking. Run [mail-tester.com](https://mail-tester.com) before production launch.

---

## Week 3 — Core templates (B1–B3, B5–B10, B4 bug fix)

**Goal:** Shared layout, render dispatcher, fix the VENUE_CLAIM_VERIFY bug, and build all templates for existing notification types.

### B1 — Shared layout component

**`lib/email/templates/_layout.tsx`** — new file. Use React Email's `Html`, `Head`, `Body`, `Container`, `Section`, `Text`, `Link`, `Preview` primitives. **Do not use CSS flexbox or grid** — use table-based layout for email client compatibility.

```tsx
import {
  Html, Head, Body, Container, Section, Text, Link, Preview,
} from '@react-email/components';

export function EmailLayout({
  preview,
  children,
  unsubscribeUrl,
}: {
  preview: string;
  children: React.ReactNode;
  unsubscribeUrl?: string;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: '#f9fafb', fontFamily: 'Arial, sans-serif', margin: 0 }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', backgroundColor: '#ffffff' }}>
          {/* Header */}
          <Section style={{ backgroundColor: '#1A1A2E', padding: '20px 24px' }}>
            <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: 'bold', margin: 0 }}>
              Artpulse
            </Text>
          </Section>
          {/* Body */}
          <Section style={{ padding: '32px 24px' }}>{children}</Section>
          {/* CAN-SPAM footer — required by law */}
          <Section style={{ borderTop: '1px solid #e5e7eb', padding: '16px 24px' }}>
            <Text style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>
              Artpulse · 123 Example Street, London, UK
            </Text>
            {unsubscribeUrl && (
              <Link href={unsubscribeUrl} style={{ fontSize: 12, color: '#9ca3af' }}>
                Unsubscribe
              </Link>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

### B2 — Render dispatcher

**`lib/email/render.ts`** — new file. One `switch` case per `NotificationType`. Use dynamic imports so unused templates are never loaded.

```ts
import { renderAsync } from '@react-email/render';
import { NotificationType } from '@prisma/client';

export async function renderEmailTemplate(
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<{ subject: string; html: string; text: string }> {
  switch (type) {
    case 'INVITE_CREATED': {
      const { VenueInviteEmail, getSubject } = await import('./templates/venue-invite');
      return {
        subject: getSubject(payload),
        html: await renderAsync(<VenueInviteEmail {...(payload as any)} />),
        text: await renderAsync(<VenueInviteEmail {...(payload as any)} />, { plainText: true }),
      };
    }
    // Add one case per NotificationType as templates are built
    default:
      throw new Error(`No email template for NotificationType: ${type}`);
  }
}
```

### B3 — Local preview script

Add to `package.json` scripts:

```json
"email:dev": "email dev --dir lib/email/templates"
```

Run with `pnpm email:dev` to get a hot-reloading browser preview of all templates.

### B4 — Fix VENUE_CLAIM_VERIFY mismatch (critical bug)

**`prisma/schema.prisma`** — add to the `NotificationType` enum:

```prisma
enum NotificationType {
  // ... existing values
  VENUE_CLAIM_VERIFY
  VENUE_CLAIM_APPROVED
  VENUE_CLAIM_REJECTED
}
```

Create migration: `prisma/migrations/YYYYMMDD_venue_claim_notification_types/migration.sql`

**`lib/venue-claims/service.ts`** — find the `enqueueNotification` call that currently uses `type: 'INVITE_CREATED'` with a `VENUE_CLAIM_VERIFY` payload, and change it to `type: 'VENUE_CLAIM_VERIFY'`.

**`lib/notification-templates.ts`** — add the new payload union types:

```ts
| { type: 'VENUE_CLAIM_VERIFY';   venueId: string; venueName: string; verifyUrl: string }
| { type: 'VENUE_CLAIM_APPROVED'; venueId: string; venueName: string; venueSlug: string }
| { type: 'VENUE_CLAIM_REJECTED'; venueId: string; venueName: string; reason?: string | null }
```

Add the corresponding `buildNotification` cases.

### B5–B10 — Templates for existing notification types

Create one file per template. Each exports a default React component and a named `getSubject(payload)` function.

| File | NotificationType | Subject pattern |
|---|---|---|
| `venue-invite.tsx` | `INVITE_CREATED` | `You're invited to manage [Venue]` |
| `submission-submitted.tsx` | `SUBMISSION_SUBMITTED` | `Your [event/venue] submission is in review` |
| `submission-approved.tsx` | `SUBMISSION_APPROVED` | `[Event] is now published on Artpulse` |
| `submission-rejected.tsx` | `SUBMISSION_REJECTED` | `Changes needed for [Event]` |
| `saved-search-match.tsx` | `SAVED_SEARCH_MATCH` | `New event matches your search: [name]` |
| `weekly-digest.tsx` | `DIGEST_READY` | `Your Artpulse digest — [date range]` |

Template structure (use for all):

```tsx
import { Button, Text, Section } from '@react-email/components';
import { EmailLayout } from './_layout';

type Props = { /* typed payload fields */ };

export function getSubject(payload: Props): string {
  return `Subject line using ${payload.someField}`;
}

export default function TemplateName(props: Props) {
  return (
    <EmailLayout preview={getSubject(props)}>
      <Text>Body content</Text>
      <Section style={{ textAlign: 'center', marginTop: 24 }}>
        <Button
          href={props.ctaUrl}
          style={{ backgroundColor: '#E63946', color: '#ffffff', padding: '12px 24px', borderRadius: 4 }}
        >
          CTA label
        </Button>
      </Section>
      {/* Plain-text fallback URL below every button */}
      <Text style={{ fontSize: 12, color: '#9ca3af' }}>
        Or copy this link: {props.ctaUrl}
      </Text>
    </EmailLayout>
  );
}
```

Run `pnpm test` after each template to ensure existing tests pass.

---

## Week 4 — Venue claim emails (B11–B13)

**Goal:** Three templates for the venue claiming flow. Depends on B4 (enum fix) being deployed.

| File | NotificationType | Subject pattern | Notes |
|---|---|---|---|
| `venue-claim-verify.tsx` | `VENUE_CLAIM_VERIFY` | `Verify your claim for [Venue]` | Prominent CTA, warn token expires in 60 min |
| `venue-claim-approved.tsx` | `VENUE_CLAIM_APPROVED` | `You now manage [Venue] on Artpulse` | CTA: Go to dashboard |
| `venue-claim-rejected.tsx` | `VENUE_CLAIM_REJECTED` | `Your claim for [Venue] was not approved` | Show optional reason. CTA: Try again |

Add each to the `renderEmailTemplate` dispatcher in `lib/email/render.ts`.

---

## Week 5 — Ticketing emails (B14–B17)

**Goal:** RSVP and event notification templates. Run in parallel with ticketing Phase 1.

New `NotificationType` values needed (add in a single migration):

```prisma
RSVP_CONFIRMED
RSVP_CANCELLED
EVENT_CHANGE_NOTIFY
EVENT_REMINDER_24H
```

| File | NotificationType | Subject pattern | Notes |
|---|---|---|---|
| `rsvp-confirmation.tsx` | `RSVP_CONFIRMED` | `You're going to [Event] at [Venue]` | Include ICS attachment placeholder for Phase 3 |
| `rsvp-cancellation.tsx` | `RSVP_CANCELLED` | `Your RSVP for [Event] has been cancelled` | Include reason if organiser-cancelled |
| `event-change.tsx` | `EVENT_CHANGE_NOTIFY` | `[Event] has been updated — check the details` | List changed fields |
| `event-reminder-24h.tsx` | `EVENT_REMINDER_24H` | `Reminder: [Event] is tomorrow` | Date, time, venue map link |

---

## Week 6 — Welcome email + snapshot tests (B18–B19, C15)

### B18 — Welcome email

**`lib/email/templates/new-user-welcome.tsx`** — new file.

- `NotificationType`: `NEW_USER_WELCOME` (add to enum + migration)
- Subject: `Welcome to Artpulse`
- Short intro, single CTA: `Explore events near you`

### C15 — Trigger welcome email on first sign-in

**`lib/auth.ts`** (or the Auth.js `signIn` callback) — add a fire-and-forget enqueue after first user creation:

```ts
await enqueueNotification({
  type: 'NEW_USER_WELCOME',
  toEmail: user.email,
  payload: { type: 'NEW_USER_WELCOME', userName: user.name },
  dedupeKey: `welcome:${user.id}`,
});
```

### B19 — Snapshot tests

Create `test/email/` directory. One test per template asserting:
- `getSubject()` returns the expected string for given props
- `renderAsync()` produces HTML containing key content (CTA text, event name, etc.)

---

## Week 7–8 — Admin mailing infrastructure (A8, C1–C12)

### C1 — Schema migrations

Three new models. Can be combined into one migration:

```prisma
enum CampaignAudience {
  ALL_USERS
  VENUE_OWNERS
  ARTISTS
  NEW_USERS_7D
  CUSTOM
}

enum CampaignStatus {
  DRAFT
  SCHEDULED
  SENDING
  SENT
  CANCELLED
}

model EmailCampaign {
  id               String           @id @default(uuid()) @db.Uuid
  name             String
  subject          String
  bodyHtml         String
  bodyText         String?
  audienceType     CampaignAudience
  audienceFilter   Json?
  status           CampaignStatus   @default(DRAFT)
  scheduledFor     DateTime?
  sentAt           DateTime?
  recipientCount   Int?
  deliveredCount   Int?
  openedCount      Int?
  createdByUserId  String           @db.Uuid
  createdAt        DateTime         @default(now())
  createdBy        User             @relation(fields: [createdByUserId], references: [id])
}

model EmailUnsubscribe {
  id        String   @id @default(uuid()) @db.Uuid
  email     String   @unique
  token     String   @unique
  reason    String?
  source    String?  // BROADCAST | TRANSACTIONAL | DIGEST
  createdAt DateTime @default(now())
}
```

Also add to `NotificationType` enum: `BROADCAST`  
Also add to `NotificationStatus` enum: `SKIPPED_UNSUBSCRIBED`

### C2 — Unsubscribe token utility

**`lib/email/unsubscribe-token.ts`** — new file. Uses Node's built-in `crypto`, no extra dependency.

```ts
import { createHmac } from 'crypto';

function secret(): string {
  if (!process.env.UNSUBSCRIBE_TOKEN_SECRET) {
    throw new Error('UNSUBSCRIBE_TOKEN_SECRET is not set');
  }
  return process.env.UNSUBSCRIBE_TOKEN_SECRET;
}

export function generateUnsubscribeToken(email: string): string {
  return createHmac('sha256', secret()).update(email.toLowerCase()).digest('hex');
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  return generateUnsubscribeToken(email) === token;
}
```

### C4 — Broadcast template

**`lib/email/templates/broadcast.tsx`** — wraps `campaign.bodyHtml` in the shared `EmailLayout`. Injects the unsubscribe link from the payload.

### C5 — Public unsubscribe page

**`app/unsubscribe/page.tsx`** — public server page, no auth required.

```tsx
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { token?: string; email?: string };
}) {
  const { token, email } = searchParams;

  if (!token || !email || !verifyUnsubscribeToken(email, token)) {
    return <p>This unsubscribe link is invalid or has expired.</p>;
  }

  await db.emailUnsubscribe.upsert({
    where: { email: email.toLowerCase() },
    create: { email: email.toLowerCase(), token, source: 'BROADCAST' },
    update: {},
  });

  return <p>You've been unsubscribed. You won't receive further emails from Artpulse.</p>;
}
```

### C6 — Skip unsubscribed emails in outbox worker

**`lib/outbox-worker.ts`** — add before the Resend send call:

```ts
// Only broadcast and digest emails respect unsubscribes.
// Transactional types (INVITE_CREATED, SUBMISSION_*, etc.) always deliver
// because they are responses to a user's own action.
if (notification.type === 'BROADCAST' || notification.type === 'DIGEST_READY') {
  const isUnsub = await db.emailUnsubscribe.findUnique({
    where: { email: notification.toEmail.toLowerCase() },
    select: { id: true },
  });
  if (isUnsub) {
    await db.notificationOutbox.updateMany({
      where: { id: notification.id, status: 'PROCESSING' },
      data: { status: 'SKIPPED_UNSUBSCRIBED', sentAt: new Date() },
    });
    skipped += 1;
    continue;
  }
}
```

### C8 — Audience resolver

**`lib/email/audience.ts`** — new file.

```ts
export async function resolveAudience(
  db: PrismaClient,
  audienceType: CampaignAudience,
  filter?: Record<string, unknown>,
): Promise<string[]> {
  const unsubs = (await db.emailUnsubscribe.findMany({ select: { email: true } }))
    .map(u => u.email);

  switch (audienceType) {
    case 'ALL_USERS':
      return (await db.user.findMany({
        where: { email: { not: null, notIn: unsubs } },
        select: { email: true },
      })).map(u => u.email!);

    case 'VENUE_OWNERS':
      // Users with at least one VenueMembership role=OWNER on a published venue
      // ... full query

    case 'ARTISTS':
      // Users with a published Artist profile
      // ... full query

    case 'NEW_USERS_7D':
      return (await db.user.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          email: { not: null, notIn: unsubs },
        },
        select: { email: true },
      })).map(u => u.email!);

    case 'CUSTOM':
      // Apply filter JSON — city, role, createdBefore/After
      // ... full query

    default:
      throw new Error(`Unknown audience type: ${audienceType}`);
  }
}
```

### C9–C10 — Campaign API routes

All routes use `requireAdmin()` from `lib/admin.ts`.

- `GET /api/admin/email/campaigns` — list, ordered by `createdAt` desc
- `POST /api/admin/email/campaigns` — create DRAFT
- `PATCH /api/admin/email/campaigns/[id]` — update (DRAFT status only)
- `DELETE /api/admin/email/campaigns/[id]` — delete (DRAFT status only)
- `POST /api/admin/email/campaigns/[id]/send`:
  1. Validate campaign is DRAFT or SCHEDULED
  2. Call `resolveAudience()` to get recipient emails
  3. Bulk-insert one `NotificationOutbox` row per recipient with `type: 'BROADCAST'` and `campaignId` in payload
  4. Set campaign `status: 'SENDING'` and `recipientCount`
  5. The standard outbox cron picks up BROADCAST rows automatically

### C11 — Resend webhook handler

**`app/api/webhooks/resend/route.ts`** — new file.

```ts
export async function POST(req: Request) {
  const body = await req.text();
  // Verify svix signature using RESEND_WEBHOOK_SECRET
  // See Resend docs: https://resend.com/docs/dashboard/webhooks/introduction

  const event = JSON.parse(body) as { type: string; data: { tags?: { name: string; value: string }[] } };

  // Extract campaignId from tags set during send
  const campaignId = event.data.tags?.find(t => t.name === 'campaignId')?.value;

  if (event.type === 'email.delivered' && campaignId) {
    await db.emailCampaign.updateMany({
      where: { id: campaignId },
      data: { deliveredCount: { increment: 1 } },
    });
  }
  if (event.type === 'email.opened' && campaignId) {
    await db.emailCampaign.updateMany({
      where: { id: campaignId },
      data: { openedCount: { increment: 1 } },
    });
  }

  return Response.json({ ok: true });
}
```

Add `RESEND_WEBHOOK_SECRET` to `ENVIRONMENT.md`.

### A8 — Outbox monitoring page

**`app/(admin)/admin/ops/email/page.tsx`** — new server component.

Shows:
- Count of PENDING / PROCESSING / SENT / FAILED in the last 24 hours
- Table of FAILED rows: type, toEmail (redacted to first 3 chars + `***`), errorMessage, attemptCount
- Retry button per row — resets row status to PENDING via `PATCH /api/admin/outbox/[id]`
- Manual trigger button — calls existing `POST /api/admin/outbox/send`

Add a link from `app/(admin)/admin/ops/page.tsx`:

```tsx
<Link href="/admin/ops/email" className="underline">Email Outbox Monitoring</Link>
```

---

## Week 9–10 — Admin settings email section + campaign UI (C13–C14, C16, Settings)

### Admin settings — email section

#### SiteSettings schema additions

Add to `prisma/schema.prisma` `SiteSettings` model:

```prisma
model SiteSettings {
  // ... existing fields
  emailEnabled         Boolean @default(false)
  emailFromAddress     String?
  emailOutboxBatchSize Int?
}
```

Create migration: `prisma/migrations/YYYYMMDD_site_settings_email/migration.sql`

#### lib/site-settings/update-site-settings.ts

Extend to accept the new fields:

```ts
export async function updateSiteSettings(data: {
  // existing fields...
  emailEnabled?: boolean;
  emailFromAddress?: string | null;
  emailOutboxBatchSize?: number | null;
}) { /* upsert as before */ }
```

#### lib/admin-settings-route.ts

Add to the Zod schema:

```ts
emailEnabled:         z.boolean().optional(),
emailFromAddress:     z.string().max(200).nullable().optional(),
emailOutboxBatchSize: z.number().int().min(1).max(100).nullable().optional(),
```

#### app/(admin)/admin/settings/email-settings-client.tsx — new file

Modelled exactly on `IngestSettingsClient`. Three controls:

1. **Enable toggle** (`emailEnabled`) — checkbox. When off, the outbox cron returns early without calling Resend.
2. **From address** (`emailFromAddress`) — text input. Overrides `RESEND_FROM_ADDRESS` env var.
3. **Batch size** (`emailOutboxBatchSize`) — number input, min 1 max 100. Overrides the hardcoded 25 per outbox run.

Plus a link to `/admin/ops/email` (outbox monitoring).

#### app/(admin)/admin/settings/page.tsx

Add `EmailSettingsClient` below `IngestSettingsClient`:

```tsx
import EmailSettingsClient from './email-settings-client';

export default async function AdminSettingsPage() {
  await requireAdmin();
  const settings = await getSiteSettings();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Settings"
        description="Configure ingest extraction and email behaviour."
      />
      <IngestSettingsClient initial={{ /* existing */ }} />
      <EmailSettingsClient
        initial={{
          emailEnabled: settings.emailEnabled ?? false,
          emailFromAddress: settings.emailFromAddress ?? null,
          emailOutboxBatchSize: settings.emailOutboxBatchSize ?? null,
        }}
      />
    </div>
  );
}
```

#### app/api/cron/outbox/send/route.ts

Use the settings instead of hardcoded values:

```ts
const settings = await getSiteSettings();

if (!settings.emailEnabled) {
  return Response.json({ ok: true, skipped: 'email_disabled' });
}

const limit = settings.emailOutboxBatchSize ?? 25;
const result = await sendPendingNotifications({ limit });
```

### Campaign UI (C13–C14)

Three pages under `app/(admin)/admin/email/`:

**`page.tsx`** — campaign list table. Columns: name, audience, status badge, recipient count, sent date, open rate (openedCount / deliveredCount). New Campaign button links to `/admin/email/new`.

**`new/page.tsx`** and **`[id]/page.tsx`** — campaign editor. Fields:
- Subject (text input)
- Body (HTML textarea or Tiptap rich text editor)
- Audience selector (dropdown of `CampaignAudience` values)
- Estimated recipient count (fetched live as audience changes via `GET /api/admin/email/campaigns/estimate?audience=...`)
- Scheduled send toggle + datetime picker
- Preview button (renders bodyHtml in a sandboxed `<iframe>`)
- Send / Schedule button → calls `POST /api/admin/email/campaigns/[id]/send`

**`[id]/report/page.tsx`** — post-send report. Shows delivered / opened / bounced / skipped counts. Simple bar or stat tiles — no chart library needed, raw numbers are sufficient for v1.

### C16 — ENVIRONMENT.md final update

Add a dedicated Email section to `ENVIRONMENT.md`:

```
## Email

| Variable                  | Required in prod | Description                                                    |
|---------------------------|-----------------|----------------------------------------------------------------|
| RESEND_API_KEY            | Yes             | Resend API key                                                 |
| RESEND_FROM_ADDRESS       | Yes             | Default from address: Artpulse <noreply@mail.artpulse.co>      |
| RESEND_WEBHOOK_SECRET     | Yes             | Webhook signature verification secret from Resend dashboard    |
| UNSUBSCRIBE_TOKEN_SECRET  | Yes             | HMAC-SHA256 secret for unsubscribe tokens. Never rotate.       |
```

---

## Template content standards

Apply to every template:

- **Subject lines** — short and specific. `Your RSVP for Gillian Wearing at Whitechapel Gallery` not `You're registered!`
- **Preheader** — every template includes a `<Preview>` component (inbox preview text)
- **One CTA per email** — use Artpulse brand colour `#E63946`. Include a plain-text fallback URL below every button for clients that block images
- **Footer** — every template uses `EmailLayout` which includes the physical address and unsubscribe link (CAN-SPAM / GDPR required)
- **Plain text** — `renderAsync(..., { plainText: true })` produces the text fallback automatically; always send both via Resend's `text` field
- **No flexbox or CSS grid** — email clients don't support them; use table-based layout via React Email's `Row`/`Column` components
- **Locale field** — include `locale?: string` in every payload type, reserved for future localisation

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Resend rate limits on large campaigns | Outbox batch of 25 at 5-minute intervals = ~300/hour, well within Resend limits. For 10,000+ recipient lists, use Resend's Broadcasts API directly (future enhancement). |
| Emails landing in spam | Verify domain in Resend dashboard. Set DMARC `p=none` initially. Run mail-tester.com before launch. |
| React Email rendering differences across clients | Test all templates in Email on Acid or Litmus before launch. Avoid CSS flexbox/grid. |
| PROCESSING rows stuck if worker crashes | Stuck-PROCESSING recovery query added in Week 2 resets rows older than 10 minutes on each worker startup. |
| GDPR compliance for broadcast to EU users | The unsubscribe system (C2, C5) covers CAN-SPAM. For full GDPR compliance, add `marketingConsent Boolean` to the `User` model and only include consenting users in broadcast audience queries. Transactional emails are exempt. |
| UNSUBSCRIBE_TOKEN_SECRET rotation | Rotating the secret invalidates all existing unsubscribe links. Document this clearly. If rotation is ever required, backfill the `EmailUnsubscribe` table with recomputed tokens before rotating. |

---

## Codex session prompts

Use these prompts verbatim for each Codex session. Each is scoped to specific files to minimise unintended changes.

**Week 1:**
> Implement tasks A1–A4 from `EMAIL_SYSTEM.md`. Install `resend`, `@react-email/components`, and `react-email`. Create `lib/email/client.ts` as specified. Add `RESEND_API_KEY` to `ENVIRONMENT.md` and `scripts/check-env.mjs`. Replace the `console.log` in the outbox worker deliver block in `lib/outbox-worker.ts` with the Resend send call. Create a stub `lib/email/render.ts` that handles `INVITE_CREATED` only. Run `pnpm test` and fix any failures before finishing.

**Week 2:**
> Implement tasks A5–A7 from `EMAIL_SYSTEM.md`. Create a migration adding `attemptCount` and `nextRetryAt` to `NotificationOutbox`. Run `pnpm prisma:generate`. Update `lib/outbox-worker.ts` with the stuck-PROCESSING recovery query, the updated `findMany` filter, and the exponential backoff failure handler. Change the outbox cron schedule in `vercel.json` to `*/5 * * * *`. Do not modify any other files. Run `pnpm test`.

**Week 3:**
> Implement tasks B1–B4 and B5–B10 from `EMAIL_SYSTEM.md`. Create `lib/email/templates/_layout.tsx`, `lib/email/render.ts`, and the six template files for existing notification types. Add `VENUE_CLAIM_VERIFY`, `VENUE_CLAIM_APPROVED`, and `VENUE_CLAIM_REJECTED` to the `NotificationType` enum in `prisma/schema.prisma`, create the migration, run `pnpm prisma:generate`, fix the enqueue call in `lib/venue-claims/service.ts`, and add the payload types and `buildNotification` cases in `lib/notification-templates.ts`. Add the `email:dev` script to `package.json`. Run `pnpm test`.

**Week 4:**
> Implement tasks B11–B13 from `EMAIL_SYSTEM.md`. Create `lib/email/templates/venue-claim-verify.tsx`, `venue-claim-approved.tsx`, and `venue-claim-rejected.tsx`. Add each to the dispatcher in `lib/email/render.ts`. Run `pnpm test`.

**Week 5:**
> Implement tasks B14–B17 from `EMAIL_SYSTEM.md`. Add `RSVP_CONFIRMED`, `RSVP_CANCELLED`, `EVENT_CHANGE_NOTIFY`, and `EVENT_REMINDER_24H` to the `NotificationType` enum, create the migration, run `pnpm prisma:generate`. Create the four template files. Add each to `lib/email/render.ts`. Run `pnpm test`.

**Week 6:**
> Implement tasks B18–B19 and C15 from `EMAIL_SYSTEM.md`. Add `NEW_USER_WELCOME` to the `NotificationType` enum, create the migration, run `pnpm prisma:generate`. Create `lib/email/templates/new-user-welcome.tsx`. Add the welcome email enqueue to the Auth.js sign-in callback in `lib/auth.ts`. Create snapshot tests in `test/email/` for all templates built so far. Run `pnpm test`.

**Week 7–8:**
> Implement tasks A8 and C1–C12 from `EMAIL_SYSTEM.md`. Create the `EmailCampaign` and `EmailUnsubscribe` schema models, add `BROADCAST` to `NotificationType` and `SKIPPED_UNSUBSCRIBED` to `NotificationStatus`, create the migration, run `pnpm prisma:generate`. Create `lib/email/unsubscribe-token.ts`, `lib/email/audience.ts`, `lib/email/templates/broadcast.tsx`. Create the campaign API routes. Create `app/api/webhooks/resend/route.ts`. Create `app/unsubscribe/page.tsx`. Add the unsubscribe skip logic to `lib/outbox-worker.ts`. Create `app/(admin)/admin/ops/email/page.tsx` and add a link to it from the existing ops page. Run `pnpm test`.

**Week 9–10:**
> Implement tasks C13–C14, C16, and the admin settings email section from `EMAIL_SYSTEM.md`. Add `emailEnabled`, `emailFromAddress`, and `emailOutboxBatchSize` to the `SiteSettings` model in `prisma/schema.prisma`, create the migration, run `pnpm prisma:generate`. Update `lib/site-settings/update-site-settings.ts` and `lib/admin-settings-route.ts` to accept the new fields. Create `app/(admin)/admin/settings/email-settings-client.tsx`. Update `app/(admin)/admin/settings/page.tsx` to render it. Update `app/api/cron/outbox/send/route.ts` to read `emailEnabled` and `emailOutboxBatchSize` from settings. Create the campaign list, editor, and report pages under `app/(admin)/admin/email/`. Update `ENVIRONMENT.md` with the final email variables section. Run `pnpm test`.
