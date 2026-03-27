import type { PrismaClient } from "@prisma/client";

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 40);
}

export async function generateTemplateVariants(
  db: PrismaClient,
  args: {
    region: string;
    country: string;
    entityType: "VENUE" | "ARTIST";
    maxVariants?: number;
    lookbackDays?: number;
  },
): Promise<string[]> {
  const maxVariants = args.maxVariants ?? 3;
  const lookbackDays = args.lookbackDays ?? 60;
  const lookbackCutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const candidates = await db.ingestDiscoveryCandidate.findMany({
    where: {
      seededVenueId: { not: null },
      job: {
        region: { equals: args.region, mode: "insensitive" },
        entityType: args.entityType,
        createdAt: { gte: lookbackCutoff },
      },
    },
    select: {
      title: true,
      seededVenue: { select: { name: true } },
    },
    take: 20,
    orderBy: { createdAt: "desc" },
  });

  const names = [
    ...new Set(
      candidates
        .map((candidate) => normalizeName(candidate.seededVenue?.name ?? candidate.title ?? ""))
        .filter((name) => name.length > 0),
    ),
  ];

  const variants = names.map((name) => {
    if (args.entityType === "ARTIST") {
      return `"${name}" artist ${args.region}`;
    }

    return `"${name}" ${args.region}`;
  });

  return variants.slice(0, maxVariants);
}
