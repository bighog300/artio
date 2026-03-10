import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { publishedEventWhere, publishedVenueWhere } from "@/lib/publish-status";

type SItem = { slug: string; updatedAt?: Date };
type TagSitemapItem = { slug: string; category: string };

export const revalidate = 3600;

let hasWarnedDbUnavailable = false;

function warnDbUnavailableOnce() {
  if (hasWarnedDbUnavailable || process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  hasWarnedDbUnavailable = true;
  console.warn("Sitemap unavailable: database is unreachable.");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!process.env.DATABASE_URL || process.env.NEXT_PHASE === "phase-production-build") {
    return [];
  }

  try {
    const [eventsRaw, venuesRaw, artistsRaw, tagsRaw] = await Promise.all([
      db.event.findMany({ where: publishedEventWhere(), select: { slug: true, updatedAt: true } }) as Promise<SItem[]>,
      db.venue.findMany({ where: publishedVenueWhere(), select: { slug: true, updatedAt: true } }) as Promise<SItem[]>,
      db.artist.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true } }) as Promise<SItem[]>,
      db.tag.findMany({ select: { slug: true, category: true } }) as Promise<TagSitemapItem[]>,
    ]);

    return [
      ...eventsRaw.map((e) => ({ url: `${base}/events/${e.slug}`, lastModified: e.updatedAt })),
      ...venuesRaw.map((v) => ({ url: `${base}/venues/${v.slug}`, lastModified: v.updatedAt })),
      ...artistsRaw.map((a) => ({ url: `${base}/artists/${a.slug}`, lastModified: a.updatedAt })),
      { url: `${base}/tags`, changeFrequency: "weekly" as const, priority: 0.5 },
      { url: `${base}/tags/medium`, changeFrequency: "weekly" as const, priority: 0.5 },
      { url: `${base}/tags/genre`, changeFrequency: "weekly" as const, priority: 0.5 },
      { url: `${base}/tags/movement`, changeFrequency: "weekly" as const, priority: 0.5 },
      { url: `${base}/tags/mood`, changeFrequency: "weekly" as const, priority: 0.5 },
      ...tagsRaw.map((tag) => ({ url: `${base}/tags/${tag.category}/${tag.slug}`, changeFrequency: "weekly" as const, priority: 0.4 })),
    ];
  } catch {
    warnDbUnavailableOnce();
    return [];
  }
}
