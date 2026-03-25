import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { getMyDashboard } from "@/lib/my/dashboard/get-my-dashboard";
import NeedsAttentionPanel from "@/app/my/_components/NeedsAttentionPanel";
import StatusTileGroups from "@/app/my/_components/StatusTileGroups";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ venueId?: string }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function MyDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my");
  if (!user) return null;

  const params = await searchParams;
  const rawVenueId = params.venueId;
  const venueId =
    rawVenueId && rawVenueId.trim().length > 0 && UUID_RE.test(rawVenueId.trim())
      ? rawVenueId.trim()
      : undefined;

  const data = await getMyDashboard({ userId: user.id, venueId });
  const hasAnyContent =
    data.counts.venues.Draft > 0 || data.counts.venues.Published > 0 ||
    data.counts.events.Draft > 0 || data.counts.events.Published > 0 ||
    data.counts.artwork.Draft > 0 || data.counts.artwork.Published > 0;

  if (!hasAnyContent) {
    return (
      <main className="space-y-6 p-6">
        <EmptyState
          title="Welcome to your publisher hub"
          body="Start by creating a venue. Once you have a venue, you can publish events and manage your team."
          actions={[
            { label: "Create a venue", href: "/my/venues/new" },
            { label: "Set up artist profile", href: "/my/artist", variant: "secondary" },
          ]}
        />
      </main>
    );
  }

  return (
    <main className="space-y-6 p-6">
      <NeedsAttentionPanel attention={data.attention} />
      <StatusTileGroups counts={data.counts} venueId={venueId} />
    </main>
  );
}
