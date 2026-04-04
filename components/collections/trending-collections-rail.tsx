"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TrendingCollection = {
  id: string;
  title: string;
  description: string | null;
  user: { username: string; displayName: string | null; isCurator: boolean };
  _count: { items: number };
  score: number;
};

export function TrendingCollectionsRail({ title = "Trending collections" }: { title?: string }) {
  const [items, setItems] = useState<TrendingCollection[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/trending/collections", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data: { items?: TrendingCollection[] }) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!items.length) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid gap-2 md:grid-cols-2">
        {items.map((collection) => (
          <Link key={collection.id} href={`/collections/${collection.id}`} className="rounded border p-3 hover:bg-muted/40">
            <p className="font-medium">{collection.title}</p>
            {collection.description ? <p className="text-sm text-muted-foreground line-clamp-2">{collection.description}</p> : null}
            <p className="text-xs text-muted-foreground mt-1">by {collection.user.displayName ?? collection.user.username}{collection.user.isCurator ? " ✓ Curator" : ""} · {collection._count.items} items</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
