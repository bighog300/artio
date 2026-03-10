import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";

const CATEGORIES = ["medium", "genre", "movement", "mood"] as const;
type Category = (typeof CATEGORIES)[number];

function isCategory(value: string): value is Category {
  return CATEGORIES.includes(value as Category);
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const title = `${category.charAt(0).toUpperCase()}${category.slice(1)} — Browse Art Events`;
  return { title };
}

export default async function TagsByCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  if (!isCategory(category)) notFound();

  const tags = await db.tag.findMany({ where: { category }, orderBy: { name: "asc" } });

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <Link href="/tags" className="text-sm text-muted-foreground underline">← Back to all tags</Link>
      <h1 className="text-3xl font-semibold capitalize">{category}</h1>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Link key={tag.id} href={`/events?tags=${encodeURIComponent(tag.slug)}`} className="rounded-full border px-3 py-1 text-sm hover:bg-muted">
            {tag.name}
          </Link>
        ))}
      </div>
    </main>
  );
}
