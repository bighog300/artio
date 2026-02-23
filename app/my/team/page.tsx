import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { MyTeamResponseSchema } from "@/lib/my/dashboard-schema";

async function getTeamData(venueId?: string) {
  const qs = venueId ? `?venueId=${encodeURIComponent(venueId)}` : "";
  const res = await fetch(`/api/my/team${qs}`, { cache: "no-store" });
  if (!res.ok) return null;
  return MyTeamResponseSchema.parse(await res.json());
}

export default async function MyTeamPage({ searchParams }: { searchParams: Promise<{ venueId?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my/team");
  const { venueId } = await searchParams;
  const data = await getTeamData(venueId);

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Team</h2>
          <p className="text-sm text-muted-foreground">{data?.venue ? data.venue.name : "Select a venue to manage members"}</p>
        </div>
        {data?.venue ? <Link className="underline" href={`/my/venues/${data.venue.id}`}>Invite member</Link> : null}
      </div>
      <section className="rounded border p-3">
        <h3 className="font-medium">Members</h3>
        <table className="mt-2 w-full text-sm"><thead><tr className="border-b"><th className="p-2 text-left">Name</th><th className="p-2">Role</th></tr></thead><tbody>{data?.members.map((member) => <tr className="border-b" key={member.id}><td className="p-2">{member.user.name ?? member.user.email}</td><td className="p-2">{member.role}</td></tr>)}</tbody></table>
      </section>
      <section className="rounded border p-3">
        <h3 className="font-medium">Invites</h3>
        <ul className="mt-2 space-y-1 text-sm">{data?.invites.map((invite) => <li key={invite.id}>{invite.email} — {invite.role} ({invite.status})</li>)}</ul>
      </section>
    </main>
  );
}
