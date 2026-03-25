import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getSiteUrl } from "@/lib/seo.public-profiles";
import { isTagCategory } from "@/lib/tag-categories";

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  if (!isTagCategory(category)) {
    return { title: "Tags | Artio" };
  }

  const capitalized =
    category.charAt(0).toUpperCase() + category.slice(1);
  const siteUrl = getSiteUrl();

  return {
    title: `${capitalized} Art Events | Artio`,
    description:
      `Browse ${category} art events and exhibitions on Artio.`,
    alternates: {
      canonical: `${siteUrl}/tags/${category}`,
    },
    openGraph: {
      title: `${capitalized} Art Events | Artio`,
      description:
        `Browse ${category} art events and exhibitions on Artio.`,
    },
  };
}

export const revalidate = 3600; // 1 hour

export default async function TagsByCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  if (!isTagCategory(category)) redirect("/tags");

  const tags = await db.tag.findMany({
    where: { category },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { eventTags: true } },
    },
  });

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <Link href="/tags" className="text-sm text-muted-foreground underline">← Back to all tags</Link>
      <h1 className="text-3xl font-semibold capitalize">{category}</h1>
      <div className="flex flex-wrap gap-2">
        {tags.filter((tag) => tag._count.eventTags > 0).map((tag) => (
          <Link key={tag.id} href={`/events?tags=${encodeURIComponent(tag.slug)}`} className="rounded-full border px-3 py-1 text-sm hover:bg-muted">
            {tag.name}
            <span className="ml-1.5 text-xs text-muted-foreground">
              {tag._count.eventTags}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
