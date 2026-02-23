import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import VenueSelfServeForm from "@/app/my/_components/VenueSelfServeForm";
import VenueMembersManager from "@/app/my/_components/VenueMembersManager";
import { PageHeader } from "@/components/ui/page-header";
import { hasDatabaseUrl } from "@/lib/runtime-db";
import { VenueGalleryManager } from "@/components/venues/venue-gallery-manager";
import { resolveImageUrl } from "@/lib/assets";
import VenuePublishPanel from "@/app/my/_components/VenuePublishPanel";
import VenueSubmitButton from "@/app/my/_components/VenueSubmitButton";
import VenueArtistRequestsPanel from "@/app/my/_components/VenueArtistRequestsPanel";
import { evaluateVenueReadiness } from "@/lib/publish-readiness";
import { PublishReadinessChecklist } from "@/components/publishing/publish-readiness-checklist";
import { Button } from "@/components/ui/button";
import { resolveVenueIdFromRouteParam } from "./route-param";

export default async function MyVenueEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my/venues");

  if (!hasDatabaseUrl()) {
    return (
      <main className="space-y-4 p-6">
        <PageHeader title="Edit Venue" subtitle="Update venue details and team access settings." />
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
  const readiness = evaluateVenueReadiness({ name: venue.name, city: venue.city, country: venue.country, featuredAssetId: venue.featuredAssetId, websiteUrl: venue.websiteUrl });

  return (
    <main className="space-y-6 p-6">
      <PageHeader
        title="Edit Venue"
        subtitle="Update venue details and team access settings."
        actions={(
          <div className="flex flex-col items-start gap-3 md:items-end">
            <VenueSubmitButton
              venueId={venueId}
              isReady={readiness.ready}
              blocking={readiness.blocking}
              initialStatus={submission?.status ?? null}
            />
            <div className="flex flex-col items-start gap-1 md:items-end">
              <Button asChild>
                <Link href={`/my/venues/${venueId}/submit-event`}>Submit Event</Link>
              </Button>
              <p className="text-xs text-muted-foreground">Create and submit events for this venue</p>
            </div>
          </div>
        )}
      />

      <PublishReadinessChecklist title="Venue publish readiness" ready={readiness.ready} blocking={readiness.blocking} warnings={readiness.warnings} />

      <VenuePublishPanel
        venueId={venue.id}
        venueSlug={venue.slug}
        isOwner={memberRole === "OWNER" || user.role === "ADMIN"}
        isPublished={venue.isPublished}
        submissionStatus={submission?.status ?? null}
        submittedAt={submission?.submittedAt?.toISOString() ?? null}
        reviewedAt={submission?.decidedAt?.toISOString() ?? null}
        decisionReason={submission?.decisionReason ?? null}
        initialIssues={readiness.blocking.map((item) => ({ field: item.id, message: item.label }))}
        readiness={readiness}
      />

      <VenueSelfServeForm venue={venue} submissionStatus={submission?.status ?? null} />

      <VenueGalleryManager
        venueId={venue.id}
        initialImages={venue.images}
        initialCover={{ featuredImageUrl: resolveImageUrl(venue.featuredAsset?.url, venue.featuredImageUrl) }}
      />

      <VenueArtistRequestsPanel
        venueId={venue.id}
        initialRequests={venue.artistAssociations.map((row) => ({
          id: row.id,
          role: row.role,
          message: row.message,
          artist: row.artist,
        }))}
      />

      {(memberRole === "OWNER" || user.role === "ADMIN") ? (
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
