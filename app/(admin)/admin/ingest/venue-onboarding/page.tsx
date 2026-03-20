import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { db } from "@/lib/db";
import { VenueOnboardingClient } from "./venue-onboarding-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminVenueOnboardingPage() {
  const venues = await db.venue.findMany({
    where: { status: "ONBOARDING", deletedAt: null },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true,
      name: true,
      city: true,
      country: true,
      lat: true,
      lng: true,
      websiteUrl: true,
      eventsPageUrl: true,
      featuredAssetId: true,
      description: true,
      openingHours: true,
      contactEmail: true,
      instagramUrl: true,
      createdAt: true,
      homepageImageCandidates: {
        where: { status: "pending" },
        orderBy: { sortOrder: "asc" },
        take: 8,
        select: { id: true, url: true, source: true, sortOrder: true },
      },
      generationRunItems: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { eventsPageStatus: true },
      },
    },
  });

  return (
    <main className="space-y-6">
      <AdminPageHeader
        title="Venue Onboarding"
        description="AI-generated venues awaiting cover image, events URL confirmation, and publish."
      />
      <VenueOnboardingClient venues={venues} />
    </main>
  );
}
