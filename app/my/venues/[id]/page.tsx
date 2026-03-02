import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canSelfPublish, getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import VenueSelfServeForm from "@/app/my/_components/VenueSelfServeForm";
import VenueMembersManager from "@/app/my/_components/VenueMembersManager";
import { PageHeader } from "@/components/ui/page-header";
import { hasDatabaseUrl } from "@/lib/runtime-db";
import { VenueGalleryManager } from "@/components/venues/venue-gallery-manager";
import { resolveImageUrl } from "@/lib/assets";
import VenuePublishPanel from "@/app/my/_components/VenuePublishPanel";
import VenueArtistRequestsPanel from "@/app/my/_components/VenueArtistRequestsPanel";
import { Button } from "@/components/ui/button";
import { resolveVenueIdFromRouteParam } from "./route-param";
import VenueSetupHeader from "@/app/my/_components/VenueSetupHeader";
import VenueCompletionProgress from "@/app/my/_components/VenueCompletionProgress";
import VenueSetupSection from "@/app/my/_components/VenueSetupSection";
import VenueCreatedDraftBanner from "@/app/my/_components/VenueCreatedDraftBanner";
import { getVenueCompletionChecks } from "@/lib/venues/venue-completion";

export default async function MyVenueEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my/venues");

  if (!hasDatabaseUrl()) {
    return (
      <main className="space-y-4 p-6">
        <PageHeader title="Venue Setup" subtitle="Complete your venue profile and submit for review." />
        <p>Set DATABASE_URL to manage venues locally.</p>
      </main>
    );
  }

  const routeVenue = await resolveVenueIdFromRouteParam(id, db);
  if (!routeVenue) notFound();
  if (routeVenue.redirected) {
    redirect(`/my/venues/${routeVenue.venueId}`);
  }
  const venueId = routeVenue.venueId;

  const venueSelect = Prisma.validator<Prisma.VenueSelect>()({
    id: true,
    featuredImageUrl: true,
    featuredAssetId: true,
    isPublished: true,
    slug: true,
    featuredAsset: { select: { url: true } },
    images: { select: { id: true, url: true, alt: true, sortOrder: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    targetSubmissions: {
      where: { type: "VENUE" },
      orderBy: { createdAt: "desc" },
      take: 1,
    },
    memberships: {
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
      orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    },
    name: true,
    description: true,
    addressLine1: true,
    addressLine2: true,
    city: true,
    region: true,
    country: true,
    postcode: true,
    lat: true,
    lng: true,
    timezone: true,
    websiteUrl: true,
    instagramUrl: true,
    artistAssociations: {
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        message: true,
        artist: { select: { id: true, name: true, slug: true } },
      },
    },
  });

  const membership = await db.venueMembership.findUnique({
    where: { userId_venueId: { userId: user.id, venueId } },
    select: {
      role: true,
      venue: {
        select: venueSelect,
      },
    },
  });

  const adminVenue = !membership && user.role === "ADMIN"
    ? await db.venue.findUnique({ where: { id: venueId }, select: venueSelect })
    : null;

  const venue = membership?.venue ?? adminVenue;
  const memberRole = membership?.role ?? null;

  if (!venue) notFound();

  const submission = venue.targetSubmissions[0] ?? null;
  const checks = getVenueCompletionChecks(venue);
  const isOwner = memberRole === "OWNER" || user.role === "ADMIN";
  const canPublishDirectly = canSelfPublish(user);

  const isCreatedFirstVisit = query.created === "1";
  const firstRequired = !checks.basicInfo ? "basic" : !checks.location ? "location" : !checks.images ? "images" : "basic";

  return (
    <main className="space-y-6 p-6">
      <PageHeader
        title="Venue Setup"
        subtitle="Complete your venue profile and submit for review."
        actions={(
          <div className="flex flex-col items-start gap-1 md:items-end">
            <Button asChild>
              <Link href={`/my/events?venueId=${venue.id}`}>View events</Link>
            </Button>
            <p className="text-xs text-muted-foreground">View and manage events for this venue</p>
          </div>
        )}
      />

      <VenueSetupHeader venue={{ name: venue.name, isPublished: venue.isPublished }} submissionStatus={submission?.status ?? null} />

      {isCreatedFirstVisit ? <VenueCreatedDraftBanner venueId={venue.id} missingRequired={checks.missingRequired} /> : null}

      <VenueCompletionProgress checks={checks} />

      {checks.publishReady && submission?.status !== "IN_REVIEW" && !venue.isPublished ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-emerald-900">{canPublishDirectly ? "This venue is ready for direct publish control in admin moderation." : "This venue is ready to submit for review."}</p>
            <Button asChild>
              <Link href="#publish-panel">{canPublishDirectly ? "Open moderation controls" : "Submit for review"}</Link>
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="order-2 space-y-4 lg:order-1 lg:col-span-2">
          <div id={`basic-section-${venue.id}`}>
            <VenueSetupSection title="Basic information" description="Name and description are required." complete={checks.basicInfo} defaultOpen={!isCreatedFirstVisit || firstRequired === "basic"}>
              <div className="space-y-4">
                <VenueSelfServeForm venue={venue} submissionStatus={submission?.status ?? null} />
                <div className="text-right">
                  <Link className="text-sm underline" href={`#location-section-${venue.id}`}>Next: Location</Link>
                </div>
              </div>
            </VenueSetupSection>
          </div>

          <div id={`location-section-${venue.id}`}>
            <VenueSetupSection title="Location" description="Used for maps and nearby discovery." complete={checks.location} defaultOpen={!isCreatedFirstVisit || firstRequired === "location"}>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Location is complete when city and country are set. Coordinates are generated automatically after address updates.
                </p>
                <div className="text-right">
                  <Link className="text-sm underline" href={`#images-section-${venue.id}`}>Next: Images</Link>
                </div>
              </div>
            </VenueSetupSection>
          </div>

          <div id={`images-section-${venue.id}`}>
            <VenueSetupSection title="Images" description="At least one image is required before submit." complete={checks.images} defaultOpen={!isCreatedFirstVisit || firstRequired === "images"}>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{venue.images.length} image{venue.images.length === 1 ? "" : "s"} uploaded.</p>
                <VenueGalleryManager
                  venueId={venue.id}
                  initialImages={venue.images}
                  initialCover={{ featuredImageUrl: resolveImageUrl(venue.featuredAsset?.url, venue.featuredImageUrl) }}
                />
                <div className="text-right">
                  <Link className="text-sm underline" href={`#contact-section-${venue.id}`}>Next: Contact & details</Link>
                </div>
              </div>
            </VenueSetupSection>
          </div>

          <div id={`contact-section-${venue.id}`}>
            <VenueSetupSection title="Contact & details" description="Optional but recommended for trust and discovery." complete={checks.contact} defaultOpen={!isCreatedFirstVisit}>
              <p className="text-sm text-muted-foreground">Add website or Instagram in the form above.</p>
            </VenueSetupSection>
          </div>
        </section>

        <aside className="order-1 lg:order-2 lg:col-span-1">
          <VenuePublishPanel
            venue={{ id: venue.id, slug: venue.slug, isPublished: venue.isPublished }}
            checks={checks}
            submissionStatus={submission?.status ?? null}
            isOwner={isOwner}
            canPublishDirectly={canPublishDirectly}
          />
        </aside>
      </div>

      <VenueArtistRequestsPanel
        venueId={venue.id}
        initialRequests={venue.artistAssociations.map((row) => ({
          id: row.id,
          role: row.role,
          message: row.message,
          artist: row.artist,
        }))}
      />

      {isOwner ? (
        <VenueMembersManager
          venueId={venue.id}
          members={venue.memberships.map((m) => ({
            id: m.id,
            role: m.role,
            user: m.user,
          }))}
        />
      ) : null}
    </main>
  );
}
