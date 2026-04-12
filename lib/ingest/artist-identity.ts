import type { PrismaClient } from "@prisma/client";
import { logInfo, logWarn } from "@/lib/logging";

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickBestBio(...bios: (string | null | undefined)[]): string | null {
  return bios
    .filter((bio): bio is string => typeof bio === "string" && bio.trim().length > 20)
    .sort((a, b) => b.length - a.length)[0] ?? null;
}

function mergeStringArrays(...arrays: (string[] | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const arr of arrays) {
    for (const item of arr ?? []) {
      const normalized = item.trim().toLowerCase();
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        result.push(item.trim());
      }
    }
  }

  return result;
}

export type ObservationInput = {
  sourceUrl: string;
  sourceDomain: string;
  siteProfileId?: string | null;
  name: string;
  bio?: string | null;
  mediums?: string[];
  collections?: string[];
  websiteUrl?: string | null;
  instagramUrl?: string | null;
  twitterUrl?: string | null;
  avatarUrl?: string | null;
  birthYear?: number | null;
  nationality?: string | null;
  exhibitionUrls?: string[];
  confidenceScore?: number;
};

export type IdentityUpsertResult = {
  identityId: string;
  isNew: boolean;
  merged: boolean;
};

export async function upsertArtistIdentity(
  db: PrismaClient,
  input: ObservationInput,
): Promise<IdentityUpsertResult> {
  const normalizedName = normalizeName(input.name);
  if (!normalizedName) {
    throw new Error(`Cannot create identity for empty name: ${input.name}`);
  }

  let identity = await db.artistIdentity.findUnique({
    where: { normalizedName },
    select: {
      id: true,
      bio: true,
      mediums: true,
      collections: true,
      websiteUrl: true,
      instagramUrl: true,
      twitterUrl: true,
      avatarUrl: true,
      birthYear: true,
      nationality: true,
    },
  });

  const isNew = !identity;

  if (!identity) {
    identity = await db.artistIdentity.create({
      data: {
        canonicalName: input.name.trim(),
        normalizedName,
        bio: input.bio,
        mediums: input.mediums ?? [],
        collections: input.collections ?? [],
        websiteUrl: input.websiteUrl,
        instagramUrl: input.instagramUrl,
        twitterUrl: input.twitterUrl,
        avatarUrl: input.avatarUrl,
        birthYear: input.birthYear,
        nationality: input.nationality,
        confidenceScore: input.confidenceScore ?? 0,
        confidenceBand:
          (input.confidenceScore ?? 0) >= 70
            ? "HIGH"
            : (input.confidenceScore ?? 0) >= 40
              ? "MEDIUM"
              : "LOW",
      },
      select: {
        id: true,
        bio: true,
        mediums: true,
        collections: true,
        websiteUrl: true,
        instagramUrl: true,
        twitterUrl: true,
        avatarUrl: true,
        birthYear: true,
        nationality: true,
      },
    });

    logInfo({ message: "artist_identity_created", normalizedName, identityId: identity.id });
  }

  await db.artistObservation.upsert({
    where: {
      identityId_sourceDomain: {
        identityId: identity.id,
        sourceDomain: input.sourceDomain,
      },
    },
    create: {
      identityId: identity.id,
      sourceUrl: input.sourceUrl,
      sourceDomain: input.sourceDomain,
      siteProfileId: input.siteProfileId,
      name: input.name.trim(),
      bio: input.bio,
      mediums: input.mediums ?? [],
      collections: input.collections ?? [],
      websiteUrl: input.websiteUrl,
      instagramUrl: input.instagramUrl,
      twitterUrl: input.twitterUrl,
      avatarUrl: input.avatarUrl,
      birthYear: input.birthYear,
      nationality: input.nationality,
      exhibitionUrls: input.exhibitionUrls ?? [],
      confidenceScore: input.confidenceScore ?? 0,
    },
    update: {
      sourceUrl: input.sourceUrl,
      bio: input.bio,
      mediums: input.mediums ?? [],
      collections: input.collections ?? [],
      websiteUrl: input.websiteUrl ?? undefined,
      instagramUrl: input.instagramUrl ?? undefined,
      twitterUrl: input.twitterUrl ?? undefined,
      avatarUrl: input.avatarUrl ?? undefined,
      birthYear: input.birthYear ?? undefined,
      nationality: input.nationality ?? undefined,
      exhibitionUrls: input.exhibitionUrls ?? [],
      confidenceScore: input.confidenceScore ?? 0,
      updatedAt: new Date(),
    },
  });

  const merged = !isNew;
  if (merged) {
    const bestBio = pickBestBio(input.bio, identity.bio);
    const mergedMediums = mergeStringArrays(input.mediums, identity.mediums);
    const mergedCollections = mergeStringArrays(input.collections, identity.collections);

    await db.artistIdentity.update({
      where: { id: identity.id },
      data: {
        bio: bestBio ?? undefined,
        mediums: mergedMediums.length > 0 ? mergedMediums : undefined,
        collections: mergedCollections.length > 0 ? mergedCollections : undefined,
        websiteUrl: identity.websiteUrl ?? input.websiteUrl ?? undefined,
        instagramUrl: identity.instagramUrl ?? input.instagramUrl ?? undefined,
        twitterUrl: identity.twitterUrl ?? input.twitterUrl ?? undefined,
        avatarUrl: identity.avatarUrl ?? input.avatarUrl ?? undefined,
        birthYear: identity.birthYear ?? input.birthYear ?? undefined,
        nationality: identity.nationality ?? input.nationality ?? undefined,
        updatedAt: new Date(),
      },
    });

    logInfo({
      message: "artist_identity_merged",
      normalizedName,
      identityId: identity.id,
      sourceDomain: input.sourceDomain,
    });
  }

  const resolved = await db.artistIdentity.findUnique({
    where: { id: identity.id },
    select: {
      artistId: true,
      bio: true,
      mediums: true,
      collections: true,
      birthYear: true,
      nationality: true,
    },
  });

  if (resolved?.artistId && merged) {
    await db.artist
      .update({
        where: { id: resolved.artistId },
        data: {
          bio: resolved.bio ?? undefined,
          mediums: resolved.mediums.length > 0 ? resolved.mediums : undefined,
          collections: resolved.collections.length > 0 ? resolved.collections : undefined,
          birthYear: resolved.birthYear ?? undefined,
          nationality: resolved.nationality ?? undefined,
        },
      })
      .catch((err: unknown) =>
        logWarn({
          message: "artist_identity_propagate_failed",
          artistId: resolved.artistId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
  }

  return { identityId: identity.id, isNew, merged };
}

export async function resolveIdentityToArtist(
  db: PrismaClient,
  identityId: string,
  artistId: string,
): Promise<void> {
  await db.artistIdentity.update({
    where: { id: identityId },
    data: { artistId },
  });
}
