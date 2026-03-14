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
  const nameMatch = await args.db.artist.findFirst({
    where: { name: { equals: args.name.trim(), mode: "insensitive" as const }, deletedAt: null },
    select: { id: true },
  });
  if (nameMatch) return { artistId: nameMatch.id, matchType: "exact_name" };

  const candidateInstagram = extractSocialHandle(args.instagramUrl, "instagram");
  const candidateTwitter = extractSocialHandle(args.twitterUrl, "twitter");

  if (candidateInstagram || candidateTwitter) {
    const socialCandidates = await args.db.artist.findMany({
      where: {
        deletedAt: null,
        OR: [
          ...(candidateInstagram ? [{ instagramUrl: { not: null } }] : []),
          ...(candidateTwitter ? [{ twitterUrl: { not: null } }] : []),
        ],
      },
      select: { id: true, instagramUrl: true, twitterUrl: true },
    });

    const socialMatch = socialCandidates.find((a) => {
      const ig = extractSocialHandle(a.instagramUrl, "instagram");
      const tw = extractSocialHandle(a.twitterUrl, "twitter");

      return (candidateInstagram && ig === candidateInstagram)
        || (candidateTwitter && tw === candidateTwitter);
    });
    if (socialMatch) return { artistId: socialMatch.id, matchType: "social_handle" };
  }

  const candidateHost = normalizeHostname(args.websiteUrl);
  if (candidateHost) {
    const webCandidates = await args.db.artist.findMany({
      where: { deletedAt: null, websiteUrl: { not: null } },
      select: { id: true, websiteUrl: true },
    });
    const webMatch = webCandidates.find((a) => normalizeHostname(a.websiteUrl) === candidateHost);
    if (webMatch) return { artistId: webMatch.id, matchType: "website_host" };
  }

  return null;
}
