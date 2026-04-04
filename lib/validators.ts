import { z } from "zod";
import { EVENT_TYPE_OPTIONS } from "@/lib/event-types";
import { normalizeAssociationRole } from "@/lib/association-roles";
import { openingHoursSchema } from "@/lib/validators/opening-hours";

export const slugSchema = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be lowercase and hyphenated");
export const artworkSlugSchema = z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be lowercase and hyphenated");
export const httpUrlSchema = z.url().refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
  message: "Must be an http(s) URL",
});

export const httpsUrlSchema = z.url().refine((value) => value.startsWith("https://"), {
  message: "Must be an https URL",
});

const isoDatetimeSchema = z.iso.datetime({ offset: true }).or(z.iso.datetime({ local: true }));
const isoDateSchema = z.iso.date();

const fromQueryDateSchema = isoDatetimeSchema.or(isoDateSchema.transform((value) => `${value}T00:00:00Z`));
const toQueryDateSchema = isoDatetimeSchema.or(isoDateSchema.transform((value) => `${value}T23:59:59.999Z`));

export const eventsQuerySchema = z.object({
  query: z.string().trim().min(1).max(120).optional(),
  from: fromQueryDateSchema.optional(),
  to: toQueryDateSchema.optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(500).optional(),
  venue: slugSchema.optional(),
  artist: slugSchema.optional(),
  tags: z.string().optional().refine((value) => !value || value.split(",").map((tag) => tag.trim()).filter(Boolean).length <= 20, "tags must include at most 20 values"),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

export const searchQuerySchema = z.object({ query: z.string().trim().min(1).optional() });
export const artistListQuerySchema = z.object({
  query: z.string().trim().min(1).max(120).optional(),
  sort: z.enum(["az", "followers", "forsale"]).optional().default("az"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(48),
});
export const slugParamSchema = z.object({ slug: slugSchema });
export const idParamSchema = z.object({ id: z.string().uuid() });
export const venueIdParamSchema = z.object({ id: z.string().uuid() });
export const artistIdParamSchema = z.object({ id: z.string().uuid() });
export const artworkIdParamSchema = z.object({ id: z.string().uuid() });
export const artworkRouteKeyParamSchema = z.object({ key: z.string().trim().min(1).max(120) });
export const eventIdParamSchema = z.object({ eventId: z.string().uuid() });
export const venueEventSubmitParamSchema = z.object({ venueId: z.string().uuid(), eventId: z.string().uuid() });
export const memberIdParamSchema = z.object({ memberId: z.string().uuid() });
export const inviteIdParamSchema = z.object({ inviteId: z.string().uuid() });
export const tokenParamSchema = z.object({ token: z.string().trim().min(16).max(255) });

export const imageIdParamSchema = z.object({ imageId: z.string().uuid() });
export const associationIdParamSchema = z.object({ associationId: z.string().uuid() });
export const associationModerationParamsSchema = z.object({ id: z.string().uuid(), associationId: z.string().uuid() });

export const artistVenueAssociationRoleSchema = z.unknown().transform((value) => normalizeAssociationRole(value));

export const artistVenueRequestBodySchema = z.object({
  venueId: z.string().uuid(),
  role: artistVenueAssociationRoleSchema.optional(),
  message: z.string().trim().max(500).optional(),
});

export const venueUploadUrlRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(5 * 1024 * 1024),
});

export const artistUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(5 * 1024 * 1024),
});

export const adminBrandingLogoUploadPayloadSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.enum(["image/png", "image/webp"]),
  size: z.number().int().positive().max(2_000_000),
});

export const adminBrandingLogoCommitSchema = z.object({
  blobUrl: httpUrlSchema,
  blobPath: z.string().trim().min(1).max(512),
  contentType: z.enum(["image/png", "image/webp"]),
  size: z.number().int().positive().max(2_000_000),
});

export const artistImageCreateSchema = z.object({
  url: httpUrlSchema,
  alt: z.string().trim().max(300).optional().nullable(),
  assetId: z.string().uuid().optional().nullable(),
});

export const artistImageUpdateSchema = z.object({
  alt: z.string().trim().max(300).optional().nullable(),
});

export const artistImageReorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).refine((value) => new Set(value).size === value.length, "orderedIds must be unique"),
});

export const artistCoverPatchSchema = z.object({
  imageId: z.string().uuid().nullable(),
});

const artworkSortSchema = z.enum(["RECENT", "OLDEST", "YEAR_DESC", "YEAR_ASC", "PRICE_ASC", "PRICE_DESC", "VIEWS_30D_DESC"]);

export const artworkListQuerySchema = z.object({
  query: z.string().trim().min(1).max(120).optional(),
  artistId: z.string().uuid().optional(),
  venueId: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  medium: z.union([z.string(), z.array(z.string())]).optional(),
  mediumCsv: z.string().optional(),
  year: z.coerce.number().int().min(1000).max(3000).optional(),
  yearFrom: z.coerce.number().int().min(1000).max(3000).optional(),
  yearTo: z.coerce.number().int().min(1000).max(3000).optional(),
  priceMin: z.coerce.number().int().min(0).optional(),
  priceMax: z.coerce.number().int().min(0).optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  hasPrice: z.coerce.boolean().optional().default(false),
  hasImages: z.coerce.boolean().optional().default(false),
  includeViews: z.union([z.literal("1"), z.literal("true"), z.literal(1), z.literal(true)]).optional().transform((value) => Boolean(value)),
  sort: artworkSortSchema.default("RECENT"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(20),
}).transform((data) => {
  const mediumArray = Array.isArray(data.medium) ? data.medium : data.medium ? [data.medium] : [];
  const csvValues = (data.mediumCsv ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const mediums = Array.from(new Set([...mediumArray, ...csvValues].map((value) => value.trim()).filter(Boolean)));
  const yearFrom = data.yearFrom ?? data.year;
  const yearTo = data.yearTo ?? data.year;
  return { ...data, mediums, yearFrom, yearTo, includeViews: data.includeViews ?? false };
}).superRefine((data, ctx) => {
  if (data.yearFrom != null && data.yearTo != null && data.yearFrom > data.yearTo) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["yearFrom"], message: "yearFrom must be <= yearTo" });
  }
  if (data.priceMin != null && data.priceMax != null && data.priceMin > data.priceMax) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["priceMin"], message: "priceMin must be <= priceMax" });
  }
});

const optionalNullableString = z.string().trim().max(4000).optional().nullable();

export const myArtworkCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: artworkSlugSchema.optional().nullable(),
  description: optionalNullableString,
  year: z.number().int().min(1000).max(3000).optional().nullable(),
  medium: z.string().trim().max(200).optional().nullable(),
  dimensions: z.string().trim().max(200).optional().nullable(),
  priceAmount: z.number().int().min(0).optional().nullable(),
  currency: z.string().trim().min(3).max(3).optional().nullable(),
});

export const myArtworkPatchSchema = myArtworkCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided",
});

export const artworkPublishPatchSchema = z.object({
  isPublished: z.boolean(),
});

export const artworkRelationsPutSchema = z.object({
  venueIds: z.array(z.string().uuid()).optional(),
  eventIds: z.array(z.string().uuid()).optional(),
});

export const artworkImageCreateSchema = z.object({
  assetId: z.string().uuid(),
  alt: z.string().trim().max(300).optional().nullable(),
});

export const artworkImageUpdateSchema = z.object({
  alt: z.string().trim().max(300).optional().nullable(),
});

export const artworkImageReorderSchema = z.object({
  imageIds: z.array(z.string().uuid()).min(1).refine((value) => new Set(value).size === value.length, "imageIds must be unique"),
});

export const artworkCoverPatchSchema = z.object({
  imageId: z.string().uuid().nullable(),
});

export const myArtistPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  bio: z.string().trim().max(4000).optional().nullable(),
  websiteUrl: httpUrlSchema.optional().nullable(),
  instagramUrl: httpUrlSchema.optional().nullable(),
  twitterUrl: httpUrlSchema.optional().nullable(),
  linkedinUrl: httpUrlSchema.optional().nullable(),
  tiktokUrl: httpUrlSchema.optional().nullable(),
  youtubeUrl: httpUrlSchema.optional().nullable(),
  mediums: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  avatarImageUrl: httpUrlSchema.optional().nullable(),
  featuredAssetId: z.string().uuid().optional().nullable(),
});

export const myArtistCreateSchema = z.object({
  name: z.string().trim().min(2).max(80).regex(/^[\p{L}\p{N}\s'.,&()\-/]+$/u, "Name contains unsupported characters"),
  websiteUrl: httpUrlSchema.optional().nullable(),
});

export const artistFeaturedArtworksReplaceSchema = z.object({
  artworkIds: z.array(z.string().uuid()).max(6),
});

export const curatedCollectionCreateSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).optional().nullable(),
  isPublished: z.boolean().optional(),
});


const optionalIsoDateSchema = z.union([z.string().datetime({ offset: true }), z.string().datetime(), z.null()]).optional();

export const curatedCollectionPatchSchema = z.object({
  slug: slugSchema.optional(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(4000).optional().nullable(),
  isPublished: z.boolean().optional(),
  publishStartsAt: optionalIsoDateSchema,
  publishEndsAt: optionalIsoDateSchema,
  homeRank: z.number().int().min(1).max(999).nullable().optional(),
  showOnHome: z.boolean().optional(),
  showOnArtwork: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (Object.keys(value).length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one field must be provided" });
  }
  if (value.publishStartsAt && value.publishEndsAt) {
    if (new Date(value.publishStartsAt).getTime() >= new Date(value.publishEndsAt).getTime()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["publishStartsAt"], message: "publishStartsAt must be before publishEndsAt" });
    }
  }
});

export const curatedCollectionItemsReplaceSchema = z.object({
  artworkIds: z.array(z.string().uuid()).max(50),
});

export const collectionPageQuerySchema = z.object({
  sort: z.enum(["CURATED", "VIEWS_30D_DESC", "NEWEST"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(48),
});

export const venueImageCreateSchema = z.object({
  assetId: z.string().uuid().optional().nullable(),
  url: httpUrlSchema.optional().nullable(),
  key: z.string().trim().min(1).max(400).optional(),
  alt: z.string().trim().max(300).optional().nullable(),
}).superRefine((data, ctx) => {
  if (!data.assetId && !data.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "Either assetId or url is required" });
  }
});

export const venueImageUpdateSchema = z.object({
  alt: z.string().trim().max(300).optional().nullable(),
});

export const venueImageReorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).refine((value) => new Set(value).size === value.length, "orderedIds must be unique"),
});

export const venueCoverPatchSchema = z.object({
  imageId: z.string().uuid().nullable().optional(),
  venueImageId: z.string().uuid().nullable().optional(),
}).superRefine((data, ctx) => {
  const candidateId = data.imageId ?? data.venueImageId;
  if (data.imageId === null || data.venueImageId === null) return;
  if (!candidateId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["imageId"], message: "imageId is required" });
  }
});


export const adminEntityImageCreateSchema = z.object({
  assetId: z.string().uuid().optional().nullable(),
  url: httpUrlSchema.optional().nullable(),
  alt: z.string().trim().max(300).optional().nullable(),
  makePrimary: z.boolean().optional(),
  setPrimary: z.boolean().optional(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
  width: z.number().int().min(1).max(10_000).optional(),
  height: z.number().int().min(1).max(10_000).optional(),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024).optional(),
  size: z.number().int().positive().max(20 * 1024 * 1024).optional(),
}).refine((data) => !(data.makePrimary !== undefined && data.setPrimary !== undefined), {
  message: "Provide only one of makePrimary or setPrimary",
}).superRefine((data, ctx) => {
  if (!data.assetId && !data.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "Either assetId or url is required" });
  }
});

export const adminEntityImagePatchSchema = z.object({
  assetId: z.string().uuid().optional().nullable(),
  url: httpsUrlSchema.optional(),
  alt: z.string().trim().max(300).optional().nullable(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
  width: z.number().int().min(1).max(10_000).optional(),
  height: z.number().int().min(1).max(10_000).optional(),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024).optional(),
  size: z.number().int().positive().max(20 * 1024 * 1024).optional(),
  isPrimary: z.literal(true).optional(),
}).refine((data) => data.alt !== undefined || data.isPrimary === true || data.url !== undefined || data.assetId !== undefined || data.contentType !== undefined || data.width !== undefined || data.height !== undefined || data.sizeBytes !== undefined || data.size !== undefined, {
  message: "At least one field must be provided",
});

export const adminEntityImageReorderSchema = z.object({
  order: z.array(z.string().uuid()).min(1).refine((value) => new Set(value).size === value.length, "order must be unique"),
});

export const favoriteBodySchema = z.object({
  targetType: z.enum(["EVENT", "VENUE", "ARTIST", "ARTWORK"]),
  targetId: z.string().uuid(),
});

export const followBodySchema = z.object({
  targetType: z.enum(["ARTIST", "VENUE", "USER"]),
  targetId: z.string().uuid(),
});

export const followManageBulkDeleteSchema = z.object({
  targets: z.array(followBodySchema).min(1).max(100),
});

export const savedSearchToggleSchema = z.object({
  isEnabled: z.boolean(),
});

export const savedSearchFrequencySchema = z.object({
  frequency: z.enum(["WEEKLY", "OFF"]),
});

export const savedSearchRenameSchema = z.object({
  name: z.string().trim().min(2).max(60),
});

export const notificationsReadBatchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

export const notificationsListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).max(512).optional(),
  unreadOnly: z.coerce.boolean().optional().default(false),
});

export const notificationsReadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100).optional(),
  all: z.boolean().optional(),
}).refine((data) => Boolean(data.all) || Boolean(data.ids?.length), {
  message: "Provide ids or all=true",
});

export const followingFeedQuerySchema = z.object({
  days: z.enum(["7", "30"]).default("7").transform((value) => Number(value) as 7 | 30),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(["both", "artist", "venue"]).default("both"),
});

export const locationPreferenceSchema = z.object({
  locationLabel: z.string().trim().min(1).max(120).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  radiusKm: z.number().int().min(1).max(200).default(25),
}).superRefine((data, ctx) => {
  const hasLat = data.lat != null;
  const hasLng = data.lng != null;
  if (hasLat !== hasLng) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [hasLat ? "lng" : "lat"], message: "lat and lng must be provided together" });
  }
});



export const engagementMetaSchema = z.object({
  digestRunId: z.string().uuid().optional(),
  position: z.number().int().min(0).max(500).optional(),
  query: z.string().trim().min(1).max(120).optional(),
  feedback: z.enum(["up", "down"]).optional(),
}).strict();

export const engagementBodySchema = z.object({
  surface: z.enum(["DIGEST", "NEARBY", "SEARCH", "FOLLOWING"]),
  action: z.enum(["VIEW", "CLICK", "FOLLOW", "SAVE_SEARCH"]),
  targetType: z.enum(["EVENT", "VENUE", "ARTIST", "SAVED_SEARCH", "DIGEST_RUN"]),
  targetId: z.string().trim().min(1).max(120),
  meta: engagementMetaSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.meta?.feedback && data.action !== "CLICK") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["meta", "feedback"],
      message: "feedback is only valid when action is CLICK",
    });
  }
});

export const geocodeQuerySchema = z.object({
  q: z.string().trim().min(3).max(120),
});

export const analyticsWindowQuerySchema = z.object({
  days: z.enum(["7", "30"]).default("7").transform((value) => Number(value) as 7 | 30),
});

export const adminAnalyticsDrilldownQuerySchema = z.object({
  days: z.enum(["7", "30"]).default("7").transform((value) => Number(value) as 7 | 30),
  targetType: z.enum(["EVENT", "VENUE", "ARTIST"]),
  targetId: z.string().trim().min(1).max(80),
  metric: z.enum(["clicks", "views"]).default("clicks"),
});

export const adminAnalyticsTopTargetsQuerySchema = z.object({
  days: z.enum(["7", "30"]).default("7").transform((value) => Number(value) as 7 | 30),
  targetType: z.enum(["EVENT", "VENUE", "ARTIST"]),
  metric: z.enum(["clicks", "views"]).default("clicks"),
  limit: z.coerce.number().int().min(5).max(50).default(20),
});

export const forYouRecommendationsQuerySchema = z.object({
  days: z.enum(["7", "30"]).default("7").transform((value) => Number(value) as 7 | 30),
  limit: z.coerce.number().int().min(5).max(30).default(20),
});

export const engagementRetentionQuerySchema = z.object({
  dryRun: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
  keepDays: z.coerce.number().int().min(30).max(365).default(90),
});

export const nearbyEventsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().int().min(1).max(200),
  q: z.string().trim().min(1).max(100).optional(),
  tags: z.string().optional().transform((value) => (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean).slice(0, 10)).refine((values) => values.every((tag) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag)), "tags must be slug-safe"),
  days: z.enum(["7", "30", "90"]).optional().transform((value) => value ? Number(value) as 7 | 30 | 90 : undefined),
  from: fromQueryDateSchema.optional(),
  to: toQueryDateSchema.optional(),
  sort: z.enum(["soonest", "distance"]).default("soonest"),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
}).superRefine((data, ctx) => {
  const hasDays = data.days != null;
  const hasRange = data.from != null || data.to != null;
  if (hasDays && hasRange) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["days"], message: "Provide either days or from/to, not both" });
  }
});



export const nearbyVenuesQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().int().min(1).max(200),
  q: z.string().trim().min(1).max(100).optional(),
  tags: z.string().optional().transform((v) => (v ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10)),
  from: fromQueryDateSchema.optional(),
  to: toQueryDateSchema.optional(),
  days: z.enum(["7", "30", "90"]).optional().transform((v) => (v ? Number(v) as 7 | 30 | 90 : undefined)),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});

export const adminArtistCreateSchema = z.object({
  name: z.string().trim().min(1),
  slug: slugSchema,
  bio: z.string().optional().nullable(),
  websiteUrl: httpUrlSchema.optional().nullable(),
  instagramUrl: httpUrlSchema.optional().nullable(),
  mediums: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  avatarImageUrl: httpUrlSchema.optional().nullable(),
  featuredImageUrl: httpUrlSchema.optional().nullable(),
  featuredAssetId: z.string().uuid().optional().nullable(),
  isPublished: z.boolean().optional(),
});

export const adminArtistPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  slug: slugSchema.optional(),
  bio: z.string().optional().nullable(),
  websiteUrl: httpUrlSchema.optional().nullable(),
  instagramUrl: httpUrlSchema.optional().nullable(),
  mediums: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  avatarImageUrl: httpUrlSchema.optional().nullable(),
  featuredImageUrl: httpUrlSchema.optional().nullable(),
  featuredAssetId: z.string().uuid().optional().nullable(),
  isPublished: z.boolean().optional(),
});

export const adminVenueCreateSchema = z.object({
  name: z.string().trim().min(1),
  slug: slugSchema,
  description: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  timezone: z.string().trim().min(1).max(80).optional().nullable(),
  websiteUrl: httpUrlSchema.optional().nullable(),
  instagramUrl: httpUrlSchema.optional().nullable(),
  contactEmail: z.email().optional().nullable(),
  featuredImageUrl: httpUrlSchema.optional().nullable(),
  featuredAssetId: z.string().uuid().optional().nullable(),
  isPublished: z.boolean().optional(),
});

export const adminVenuePatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  slug: slugSchema.optional(),
  description: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  timezone: z.string().trim().min(1).max(80).optional().nullable(),
  websiteUrl: httpUrlSchema.optional().nullable(),
  instagramUrl: httpUrlSchema.optional().nullable(),
  contactEmail: z.email().optional().nullable(),
  featuredImageUrl: httpUrlSchema.optional().nullable(),
  featuredAssetId: z.string().uuid().optional().nullable(),
  isPublished: z.boolean().optional(),
});

export const myVenuePatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  timezone: z.string().trim().min(1).max(80).optional().nullable(),
  autoDetectTimezone: z.boolean().optional(),
  websiteUrl: httpUrlSchema.optional().nullable(),
  instagramUrl: httpUrlSchema.optional().nullable(),
  openingHours: openingHoursSchema.optional(),
  featuredImageUrl: httpUrlSchema.optional().nullable(),
  featuredAssetId: z.string().uuid().optional().nullable(),
  submitForApproval: z.boolean().optional(),
  note: z.string().trim().max(2000).optional().nullable(),
});

export const myVenueCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  addressLine1: z.string().trim().min(1).max(120).optional(),
  addressLine2: z.string().trim().max(120).optional(),
  address: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().max(80).optional().nullable(),
  region: z.string().trim().max(80).optional(),
  country: z.string().trim().max(80).optional().nullable(),
  postcode: z.string().trim().max(20).optional(),
  lat: z.number().finite().min(-90).max(90).optional(),
  lng: z.number().finite().min(-180).max(180).optional(),
  websiteUrl: httpUrlSchema.optional().nullable(),
  website: httpUrlSchema.optional().nullable(),
  instagramUrl: httpUrlSchema.optional().nullable(),
}).transform((data) => ({
  ...data,
  addressLine1: data.addressLine1 ?? data.address,
  websiteUrl: data.websiteUrl ?? data.website,
}));

const eventImageSchema = z.object({
  assetId: z.string().uuid().optional().nullable(),
  url: httpUrlSchema.optional().nullable(),
  alt: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
}).superRefine((data, ctx) => {
  if (!data.assetId && !data.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "Either assetId or url is required" });
  }
});

const adminEventShape = {
  title: z.string().trim().min(1),
  slug: slugSchema,
  description: z.string().optional().nullable(),
  timezone: z.string().trim().min(1),
  startAt: isoDatetimeSchema,
  endAt: isoDatetimeSchema.optional().nullable(),
  venueId: z.string().uuid().optional().nullable(),
  tagSlugs: z.array(slugSchema).optional(),
  artistSlugs: z.array(slugSchema).optional(),
  images: z.array(eventImageSchema).optional(),
  isPublished: z.boolean().optional(),
};

export const adminEventCreateSchema = z.object(adminEventShape).superRefine((data, ctx) => {
  if (data.endAt && new Date(data.endAt) < new Date(data.startAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endAt"], message: "endAt must be >= startAt" });
  }
});

export const adminEventPatchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  slug: slugSchema.optional(),
  description: z.string().optional().nullable(),
  timezone: z.string().trim().min(1).optional(),
  startAt: isoDatetimeSchema.optional(),
  endAt: isoDatetimeSchema.optional().nullable(),
  venueId: z.string().uuid().optional().nullable(),
  tagSlugs: z.array(slugSchema).optional(),
  artistSlugs: z.array(slugSchema).optional(),
  images: z.array(eventImageSchema).optional(),
  isPublished: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.startAt && data.endAt && new Date(data.endAt) < new Date(data.startAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endAt"], message: "endAt must be >= startAt" });
  }
});

const myEventShape = {
  title: z.string().trim().min(1),
  slug: slugSchema,
  description: z.string().optional().nullable(),
  timezone: z.string().trim().min(1),
  startAt: isoDatetimeSchema,
  endAt: isoDatetimeSchema.optional().nullable(),
  images: z.array(eventImageSchema).optional(),
  featuredAssetId: z.string().uuid().optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
};

export const myEventCreateSchema = z.object(myEventShape).superRefine((data, ctx) => {
  if (data.endAt && new Date(data.endAt) < new Date(data.startAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endAt"], message: "endAt must be >= startAt" });
  }
});

export const myEventPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  slug: slugSchema.optional(),
  description: z.string().trim().max(4000).optional().nullable(),
  timezone: z.string().trim().min(1).optional(),
  startAt: isoDatetimeSchema.optional(),
  endAt: isoDatetimeSchema.optional().nullable(),
  venueId: z.string().uuid().optional().nullable(),
  images: z.array(eventImageSchema).optional(),
  featuredAssetId: z.string().uuid().optional().nullable(),
  eventType: z.enum(EVENT_TYPE_OPTIONS).optional().nullable(),
  ticketingMode: z.enum(["EXTERNAL", "RSVP", "PAID"]).optional(),
  capacity: z.number().int().positive().optional().nullable(),
  rsvpClosesAt: isoDatetimeSchema.optional().nullable(),
  seriesId: z.string().uuid().optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.startAt && data.endAt && new Date(data.endAt) < new Date(data.startAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endAt"], message: "endAt must be >= startAt" });
  }
});

export const CreateEventSchema = z.object({
  title: z.string().trim().min(2).max(120),
  startAt: isoDatetimeSchema,
  endAt: isoDatetimeSchema.optional(),
  venueId: z.string().uuid().optional(),
  ticketUrl: httpUrlSchema.optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
  eventType: z.enum(EVENT_TYPE_OPTIONS).optional(),
}).superRefine((data, ctx) => {
  if (data.endAt && new Date(data.endAt) < new Date(data.startAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endAt"], message: "endAt must be >= startAt" });
  }
});



export const eventRevisionPatchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().min(20).optional().nullable(),
  startAt: isoDatetimeSchema.optional(),
  endAt: isoDatetimeSchema.optional().nullable(),
  ticketUrl: httpUrlSchema.optional().nullable(),
  images: z.array(eventImageSchema).optional(),
}).superRefine((data, ctx) => {
  if (data.startAt && data.endAt && new Date(data.endAt) <= new Date(data.startAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endAt"], message: "endAt must be > startAt" });
  }
});

export const eventRevisionBodySchema = z.object({
  patch: eventRevisionPatchSchema,
  message: z.string().trim().max(2000).optional(),
});

export const venueSubmitBodySchema = z.object({
  message: z.string().trim().max(2000).optional(),
});

export const eventSubmitBodySchema = z.object({
  message: z.string().trim().max(2000).optional(),
});

export const artistSubmitBodySchema = z.object({
  message: z.string().trim().max(2000).optional(),
});

export const adminSubmissionRequestChangesSchema = z.object({
  message: z.string().trim().min(10).max(2000),
});


export const betaAccessRequestSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  note: z.string().trim().max(1000).optional(),
});

export const betaFeedbackSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  pagePath: z.string().trim().max(500).optional(),
  message: z.string().trim().min(1).max(2000),
});

export const betaRequestStatusPatchSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "DENIED"]),
});

export const accessRequestCreateSchema = z.object({
  requestedRole: z.enum(["viewer", "moderator", "operator", "admin"]),
  reason: z.string().trim().max(1000).optional(),
});

export const accessRequestRejectionSchema = z.object({
  rejectionReason: z.string().trim().max(1000).optional(),
});

export const submissionDecisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  decisionReason: z.string().trim().max(2000).optional().nullable(),
});

export const adminModerationRejectSchema = z.object({
  rejectionReason: z.string().trim().min(5).max(2000),
});

export const venueMemberCreateSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  role: z.enum(["OWNER", "EDITOR"]),
});

export const venueMemberDirectAddSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  role: z.literal("EDITOR"),
});

export const venueMemberPatchSchema = z.object({
  role: z.enum(["OWNER", "EDITOR"]),
});

export const venueInviteCreateSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  role: z.enum(["OWNER", "EDITOR"]),
});


export function zodDetails(error: z.ZodError) {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

function formValueToPrimitive(value: FormDataEntryValue) {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  if (normalized === "") return null;
  if (normalized === "true" || normalized === "on") return true;
  if (normalized === "false") return false;
  if (!Number.isNaN(Number(normalized)) && normalized !== "") return Number(normalized);
  return normalized;
}

export async function parseBody(req: Request) {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      return await req.json();
    } catch {
      return {};
    }
  }
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    return Object.fromEntries(Array.from((await req.formData()).entries()).map(([k, v]) => [k, formValueToPrimitive(v)]));
  }
  return {};
}

export function paramsToObject(searchParams: URLSearchParams) {
  const out: Record<string, string | string[]> = {};
  for (const key of searchParams.keys()) {
    const values = searchParams.getAll(key);
    out[key] = values.length > 1 ? values : (values[0] ?? "");
  }
  return out;
}


export const curatedCollectionHomeOrderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).max(100).refine((value) => new Set(value).size === value.length, "orderedIds must be unique"),
  resetOthers: z.boolean().optional(),
});
