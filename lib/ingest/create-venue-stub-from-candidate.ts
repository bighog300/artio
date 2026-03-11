import type { PrismaClient } from "@prisma/client";
import { ensureUniqueVenueSlugWithDeps, slugifyVenueName } from "@/lib/venue-slug";

function deriveNameFromTitle(raw: string | null): string {
  if (!raw?.trim()) return "Untitled Venue";
  return (
    raw
      .split(/[|\-–—]/)[0]
      .replace(/\b(home|welcome|official\s+site|website)\b/gi, "")
      .trim()
      .replace(/\s+/g, " ") || "Untitled Venue"
  );
}

export async function createVenueStubFromCandidate(args: {
  candidateUrl: string;
  candidateTitle: string | null;
  regionId: string | null;
  country: string | null;
  region: string | null;
  db: PrismaClient;
}): Promise<{ venueId: string } | null> {
  try {
    const existing = await args.db.venue.findFirst({
      where: { websiteUrl: args.candidateUrl },
      select: { id: true },
    });
    if (existing) return null;

    const name = deriveNameFromTitle(args.candidateTitle);
    const baseSlug = slugifyVenueName(name);
    const slug = await ensureUniqueVenueSlugWithDeps(
      { findBySlug: (s) => args.db.venue.findUnique({ where: { slug: s }, select: { id: true } }) },
      baseSlug,
    );
    if (!slug) return null;

    const venue = await args.db.venue.create({
      data: {
        name,
        slug,
        websiteUrl: args.candidateUrl,
        eventsPageUrl: args.candidateUrl,
        country: args.country ?? "",
        region: args.region ?? null,
        isPublished: false,
        aiGenerated: true,
        aiGeneratedAt: new Date(),
        claimStatus: "UNCLAIMED",
      },
      select: { id: true },
    });

    return { venueId: venue.id };
  } catch (error) {
    console.error("create_venue_stub_failed", { url: args.candidateUrl, error });
    return null;
  }
}
