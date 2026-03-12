import AdminPageHeader from "../../_components/AdminPageHeader";
import { getVenueGenerationRuns } from "@/lib/venue-generation/get-venue-generation-runs";
import { VenueGenerationClient } from "./venue-generation-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminVenueGenerationPage() {
  const runs = await getVenueGenerationRuns();

  return (
    <main className="space-y-6">
      <AdminPageHeader title="Venue AI Generation" description="Generate unpublished, claimable venue records by region." />
      <VenueGenerationClient initialRuns={runs} />
    </main>
  );
}
