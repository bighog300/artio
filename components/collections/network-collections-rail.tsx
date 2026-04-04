import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function NetworkCollectionsRail({ title = "From people you follow" }: { title?: string }) {
  const user = await getSessionUser();
  if (!user) return null;

  const followedUsers = await db.follow.findMany({
    where: { userId: user.id, targetType: "USER" },
    select: { targetId: true },
    take: 40,
  });
  if (!followedUsers.length) return null;

  const collections = await db.collection.findMany({
    where: { userId: { in: followedUsers.map((row) => row.targetId) }, isPublic: true },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: {
      id: true,
      title: true,
      description: true,
      user: { select: { username: true, displayName: true } },
      _count: { select: { items: true } },
    },
  });
  if (!collections.length) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid gap-2 md:grid-cols-2">
        {collections.map((collection) => (
          <Link key={collection.id} href={`/collections/${collection.id}`} className="rounded border p-3 hover:bg-muted/40">
            <p className="font-medium">{collection.title}</p>
            {collection.description ? <p className="text-sm text-muted-foreground line-clamp-2">{collection.description}</p> : null}
            <p className="text-xs text-muted-foreground mt-1">by {collection.user.displayName ?? collection.user.username} · {collection._count.items} items</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
