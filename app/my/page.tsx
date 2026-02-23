import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { MyDashboardResponseSchema } from "@/lib/my/dashboard-schema";

async function getDashboard(venueId?: string) {
  const qs = venueId ? `?venueId=${encodeURIComponent(venueId)}` : "";
  const res = await fetch(`/api/my/dashboard${qs}`, { cache: "no-store" });
  if (!res.ok) return null;
  return MyDashboardResponseSchema.parse(await res.json());
}

export default async function MyDashboardPage({ searchParams }: { searchParams: Promise<{ venueId?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my");

  const { venueId } = await searchParams;
  const data = await getDashboard(venueId);
  if (!data) return <main><p>Unable to load dashboard.</p></main>;

  return (
    <main className="space-y-4">
      <section className="rounded border p-3">
        <h2 className="text-lg font-semibold">Needs attention</h2>
        <ul className="mt-2 space-y-2">
          {data.attention.map((item) => (
            <li key={item.id} className="rounded border p-2 text-sm">
              <p className="font-medium">{item.title}</p>
              <p className="text-muted-foreground">{item.reason}</p>
              <Link className="underline" href={item.ctaHref}>{item.ctaLabel}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Link href={`/my/venues?status=Draft${venueId ? `&venueId=${venueId}` : ""}`} className="rounded border p-3">
          <p className="text-xs text-muted-foreground">Venue drafts</p>
          <p className="text-2xl font-semibold">{data.counts.venues.Draft}</p>
        </Link>
        <Link href={`/my/events?status=Submitted${venueId ? `&venueId=${venueId}` : ""}`} className="rounded border p-3">
          <p className="text-xs text-muted-foreground">Events submitted</p>
          <p className="text-2xl font-semibold">{data.counts.events.Submitted}</p>
        </Link>
        <Link href={`/my/artwork?status=Draft${venueId ? `&venueId=${venueId}` : ""}`} className="rounded border p-3">
          <p className="text-xs text-muted-foreground">Artwork drafts</p>
          <p className="text-2xl font-semibold">{data.counts.artwork.Draft}</p>
        </Link>
      </section>

      <section className="rounded border p-3">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {data.recentActivity.map((item) => <li key={item.id}><Link className="underline" href={item.href}>{item.label}</Link></li>)}
        </ul>
      </section>
    </main>
  );
}
