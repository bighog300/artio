import { z } from "zod";

export const PublisherEntityTypeSchema = z.enum(["venue", "event", "artwork", "team"]);
export type PublisherEntityType = z.infer<typeof PublisherEntityTypeSchema>;

export const PublisherStatusSchema = z.enum(["Draft", "Submitted", "Published", "Rejected"]);
export type PublisherStatus = z.infer<typeof PublisherStatusSchema>;

export const AttentionKindSchema = z.enum(["rejected", "pending_review", "incomplete_draft", "revision_required", "pending_invite"]);
export type AttentionKind = z.infer<typeof AttentionKindSchema>;

export const AttentionItemSchema = z.object({
  id: z.string(),
  kind: AttentionKindSchema,
  entityType: PublisherEntityTypeSchema,
  entityId: z.string(),
  title: z.string(),
  reason: z.string(),
  status: z.string().optional(),
  ctaLabel: z.string(),
  ctaHref: z.string().startsWith("/my"),
  venueId: z.string().optional(),
  createdAtISO: z.string().datetime().optional(),
  updatedAtISO: z.string().datetime().optional(),
}).refine((value) => Boolean(value.createdAtISO ?? value.updatedAtISO), {
  message: "Attention item requires at least one timestamp",
});
export type AttentionItem = z.infer<typeof AttentionItemSchema>;

export const ActivityItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  href: z.string().startsWith("/my"),
  occurredAtISO: z.string().datetime(),
});
export type ActivityItem = z.infer<typeof ActivityItemSchema>;

export const VenueSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["OWNER", "EDITOR"]),
  status: PublisherStatusSchema,
  updatedAtISO: z.string().datetime(),
  completeness: z.object({
    percent: z.number().int().min(0).max(100),
    missing: z.array(z.string()),
  }).optional(),
});
export type VenueSummary = z.infer<typeof VenueSummarySchema>;

export const EventSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  venueId: z.string().nullable(),
  venueName: z.string().nullable(),
  status: PublisherStatusSchema,
  startAtISO: z.string().datetime(),
  updatedAtISO: z.string().datetime(),
});
export type EventSummary = z.infer<typeof EventSummarySchema>;

export const ArtworkSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["Draft", "Published"]),
  updatedAtISO: z.string().datetime(),
  imageUrl: z.string().url().nullable(),
});
export type ArtworkSummary = z.infer<typeof ArtworkSummarySchema>;

export const PagedSchema = <T extends z.ZodTypeAny>(item: T) => z.object({
  items: z.array(item),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export const MyDashboardResponseSchema = z.object({
  context: z.object({
    selectedVenueId: z.string().nullable(),
    venues: z.array(z.object({ id: z.string(), name: z.string(), role: z.enum(["OWNER", "EDITOR"]) })),
    hasArtistProfile: z.boolean(),
  }),
  counts: z.object({
    venues: z.record(PublisherStatusSchema, z.number().int().nonnegative()),
    events: z.record(PublisherStatusSchema, z.number().int().nonnegative()),
    artwork: z.object({ Draft: z.number().int().nonnegative(), Published: z.number().int().nonnegative() }),
  }),
  attention: z.array(AttentionItemSchema),
  recentActivity: z.array(ActivityItemSchema),
  quickLists: z.object({
    venues: z.array(VenueSummarySchema),
    upcomingEvents: z.array(EventSummarySchema),
    recentArtwork: z.array(ArtworkSummarySchema),
  }),
  publisherNotice: z.object({
    noticeId: z.string(),
  }).nullable().optional(),
});
export type MyDashboardResponse = z.infer<typeof MyDashboardResponseSchema>;

export const MyTeamResponseSchema = z.object({
  venue: z.object({ id: z.string(), name: z.string() }).nullable(),
  selectedVenueId: z.string().nullable(),
  currentUserRole: z.enum(["OWNER", "EDITOR"]).nullable(),
  members: z.array(z.object({
    id: z.string(),
    role: z.enum(["OWNER", "EDITOR"]),
    createdAtISO: z.string().datetime(),
    user: z.object({ id: z.string(), email: z.string().email(), name: z.string().nullable() }),
  })),
  invites: z.array(z.object({
    id: z.string(),
    email: z.string().email(),
    role: z.enum(["OWNER", "EDITOR"]),
    status: z.enum(["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"]),
    createdAtISO: z.string().datetime(),
    expiresAtISO: z.string().datetime(),
  })),
});
export type MyTeamResponse = z.infer<typeof MyTeamResponseSchema>;
