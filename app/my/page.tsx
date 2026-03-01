import Link from "next/link";
import type { ContentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { StatusBadge } from "@/components/publishing/StatusBadge";
import { getPrimaryAction } from "@/lib/publishing/getPrimaryAction";

type MyItem = {
  id: string;
  type: "Event" | "Venue" | "Artist";
  title: string;
  status: ContentStatus;
  updatedAt: Date;
  editHref: string;
  liveHref?: string;
};

function ItemCard({ item }: { item: MyItem }) {
  const action = getPrimaryAction(item.status, {
    edit: item.editHref,
    status: item.editHref,
    live: item.liveHref,
  });

  return (
    <article className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{item.type}</p>
          <h3 className="font-medium">{item.title}</h3>
          <p className="text-xs text-muted-foreground">Updated {item.updatedAt.toLocaleDateString()}</p>
        </div>
        <StatusBadge status={item.status} />
      </div>
      <div className="mt-3">
        {action.href && !action.disabled ? <Link className="underline" href={action.href}>{action.label}</Link> : <span className="text-muted-foreground">{action.label}</span>}
      </div>
    </article>
  );
}

export default async function MyDashboardPage() {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my");

  const [events, venueMemberships, artist] = await Promise.all([
    db.event.findMany({
      where: {
        deletedAt: null,
        OR: [
          { submissions: { some: { submitterUserId: user.id, type: "EVENT", OR: [{ kind: "PUBLISH" }, { kind: null }] } } },
          { venue: { memberships: { some: { userId: user.id, role: { in: ["OWNER", "EDITOR"] } } } } },
        ],
      },
      select: { id: true, title: true, status: true, updatedAt: true, slug: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    db.venueMembership.findMany({
      where: { userId: user.id, role: { in: ["OWNER", "EDITOR"] }, venue: { deletedAt: null } },
      select: { venue: { select: { id: true, name: true, slug: true, status: true, updatedAt: true } } },
    }),
    db.artist.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, status: true, updatedAt: true } }),
  ]);

  const items: MyItem[] = [
    ...events.map((event) => ({
      id: event.id,
      type: "Event" as const,
      title: event.title,
      status: event.status,
      updatedAt: event.updatedAt,
      editHref: `/my/events/${event.id}`,
      liveHref: event.slug ? `/events/${event.slug}` : undefined,
    })),
    ...venueMemberships.map((membership) => ({
      id: membership.venue.id,
      type: "Venue" as const,
      title: membership.venue.name,
      status: membership.venue.status,
      updatedAt: membership.venue.updatedAt,
      editHref: `/my/venues/${membership.venue.id}`,
      liveHref: membership.venue.slug ? `/venues/${membership.venue.slug}` : undefined,
    })),
    ...(artist
      ? [{
          id: artist.id,
          type: "Artist" as const,
          title: artist.name,
          status: artist.status,
          updatedAt: artist.updatedAt,
          editHref: "/my/artist",
          liveHref: artist.slug ? `/artists/${artist.slug}` : undefined,
        }]
      : []),
  ];

  const needsAttention = items.filter((item) => item.status === "DRAFT" || item.status === "CHANGES_REQUESTED");
  const inReview = items.filter((item) => item.status === "IN_REVIEW");
  const published = items.filter((item) => item.status === "PUBLISHED").sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  return (
    <main className="space-y-6 p-6">
      <header className="rounded-lg border p-4">
        <h1 className="text-2xl font-semibold">My content</h1>
        <p className="text-sm text-muted-foreground">Create quickly, then complete details when you are ready to submit for review.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/my/events/new" className="rounded border px-3 py-1.5 text-sm font-medium">New Event</Link>
          <Link href="/my/venues/new" className="rounded border px-3 py-1.5 text-sm font-medium">New Venue</Link>
          <Link href="/my/artist" className="rounded border px-3 py-1.5 text-sm font-medium">New Artist</Link>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Needs Attention</h2>
        {needsAttention.length === 0 ? <p className="rounded border p-4 text-sm text-muted-foreground">No drafts need action right now.</p> : <div className="grid gap-3 md:grid-cols-2">{needsAttention.map((item) => <ItemCard key={`${item.type}-${item.id}`} item={item} />)}</div>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">In Review</h2>
        {inReview.length === 0 ? <p className="rounded border p-4 text-sm text-muted-foreground">Nothing is currently in review.</p> : <div className="grid gap-3 md:grid-cols-2">{inReview.map((item) => <ItemCard key={`${item.type}-${item.id}`} item={item} />)}</div>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Published</h2>
        {published.length === 0 ? <p className="rounded border p-4 text-sm text-muted-foreground">Publish something to see it here.</p> : <div className="grid gap-3 md:grid-cols-2">{published.map((item) => <ItemCard key={`${item.type}-${item.id}`} item={item} />)}</div>}
      </section>
    </main>
  );
}
