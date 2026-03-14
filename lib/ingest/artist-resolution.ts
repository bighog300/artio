import type { PrismaClient } from "@prisma/client";

type MatchType = "exact_name" | "social_handle" | "website_host";

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeHostname(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;

  const withProtocol = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function toHandleCandidate(value: string): string {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

function extractSocialHandle(urlOrHandle: string | null | undefined, network: "instagram" | "twitter"): string | null {
  if (!urlOrHandle?.trim()) return null;

  const rawValue = urlOrHandle.trim();
  const withProtocol = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;

  try {
    const parsed = new URL(withProtocol);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const allowedHosts = network === "instagram"
      ? ["instagram.com"]
      : ["twitter.com", "x.com"];

    if (!allowedHosts.includes(hostname)) return null;

    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (pathParts.length === 0) return null;

    const firstPart = pathParts[0];
    const blockedPrefixes = network === "instagram"
      ? ["p", "reel", "stories", "explore"]
      : ["home", "explore", "search", "intent", "i", "hashtag", "share"];

    if (blockedPrefixes.includes(firstPart.toLowerCase())) return null;

    return toHandleCandidate(firstPart);
  } catch {
    const normalized = toHandleCandidate(rawValue);
    return normalized.length > 0 ? normalized : null;
  }
}

export async function resolveArtistCandidate(args: {
  db: PrismaClient;
  name: string;
  websiteUrl?: string | null;
  instagramUrl?: string | null;
  twitterUrl?: string | null;
}): Promise<{ artistId: string; matchType: MatchType } | null> {
  const normalizedCandidateName = normalizeName(args.name);
  const nameMatch = await args.db.artist.findFirst({
    where: {
      name: { equals: args.name.trim(), mode: "insensitive" },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (nameMatch) return { artistId: nameMatch.id, matchType: "exact_name" };

  const nameTokens = normalizedCandidateName.split(" ").filter(Boolean);
  if (nameTokens.length > 0) {
    const normalizedNameCandidates = await args.db.artist.findMany({
      where: {
        deletedAt: null,
        AND: nameTokens.map((token) => ({ name: { contains: token, mode: "insensitive" } })),
      },
      select: { id: true, name: true },
    });

    const normalizedNameMatch = normalizedNameCandidates.find((artist) => normalizeName(artist.name) === normalizedCandidateName);
    if (normalizedNameMatch) return { artistId: normalizedNameMatch.id, matchType: "exact_name" };
  }

  const candidateInstagramHandle = extractSocialHandle(args.instagramUrl, "instagram");
  const candidateTwitterHandle = extractSocialHandle(args.twitterUrl, "twitter");

  if (candidateInstagramHandle || candidateTwitterHandle) {
    const socialCandidates = await args.db.artist.findMany({
      where: {
        deletedAt: null,
        OR: [
          ...(candidateInstagramHandle ? [{ instagramUrl: { not: null } }] : []),
          ...(candidateTwitterHandle ? [{ twitterUrl: { not: null } }] : []),
        ],
      },
      select: { id: true, instagramUrl: true, twitterUrl: true },
    });

    const socialMatch = socialCandidates.find((artist) => {
      const artistInstagramHandle = extractSocialHandle(artist.instagramUrl, "instagram");
      const artistTwitterHandle = extractSocialHandle(artist.twitterUrl, "twitter");

      return (
        (candidateInstagramHandle && artistInstagramHandle === candidateInstagramHandle)
        || (candidateTwitterHandle && artistTwitterHandle === candidateTwitterHandle)
      );
    });

    if (socialMatch) return { artistId: socialMatch.id, matchType: "social_handle" };
  }

  const candidateWebsiteHost = normalizeHostname(args.websiteUrl);
  if (candidateWebsiteHost) {
    const websiteCandidates = await args.db.artist.findMany({
      where: { deletedAt: null, websiteUrl: { not: null } },
      select: { id: true, websiteUrl: true },
    });

    const websiteMatch = websiteCandidates.find((artist) => normalizeHostname(artist.websiteUrl) === candidateWebsiteHost);
    if (websiteMatch) return { artistId: websiteMatch.id, matchType: "website_host" };
  }

  return null;
}
