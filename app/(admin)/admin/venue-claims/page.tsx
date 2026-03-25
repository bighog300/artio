import AdminPageHeader from "../_components/AdminPageHeader";
import { db } from "@/lib/db";
import VenueClaimsClient from "./venue-claims-client";

export const runtime = "nodejs";

export default async function AdminVenueClaimsPage() {
  const claims = await db.venueClaimRequest.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      venue: { select: { id: true, name: true, slug: true } },
      user: { select: { id: true, email: true } },
      invite: { select: { id: true, personalMessage: true } },
    },
  });

  return (
    <main className="space-y-6">
      <AdminPageHeader title="Venue Claims" description="Review manual-review and verification claim requests." />
      <VenueClaimsClient claims={claims.map((claim) => ({ ...claim, createdAt: claim.createdAt.toISOString(), verifiedAt: claim.verifiedAt?.toISOString() ?? null }))} />
    </main>
  );
}
