import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import VenueMembersManager from "@/app/my/_components/VenueMembersManager";
import { MyTeamResponseSchema } from "@/lib/my/dashboard-schema";
import { getServerBaseUrl } from "@/lib/server/get-base-url";

async function getTeamData(venueId?: string) {
  const qs = venueId ? `?venueId=${encodeURIComponent(venueId)}` : "";
  const baseUrl = await getServerBaseUrl();
  const res = await fetch(`${baseUrl}/api/my/team${qs}`, { cache: "no-store" });
  if (!res.ok) return null;
  return MyTeamResponseSchema.parse(await res.json());
}

export default async function MyTeamPage({ searchParams }: { searchParams: Promise<{ venueId?: string }> }) {
  const user = await getSessionUser();
  if (!user) return redirectToLogin("/my/team");
  const { venueId } = await searchParams;
  const data = await getTeamData(venueId);

  return (
    <main className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-sm text-muted-foreground">
            {data?.venue ? data.venue.name : "Select a venue using the venue filter above to manage its team."}
          </p>
        </div>
      </div>

      {!data?.venue ? (
        <div className="rounded border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No venue selected. Use the venue filter in the header to choose a venue.
          </p>
        </div>
      ) : (
        <VenueMembersManager
          venueId={data.venue.id}
          members={data.members.map((m) => ({
            id: m.id,
            role: m.role as "OWNER" | "EDITOR",
            user: m.user,
          }))}
        />
      )}
    </main>
  );
}
