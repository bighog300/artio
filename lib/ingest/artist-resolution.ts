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
  const candidateInstagramHandle = extractSocialHandle(args.instagramUrl, "instagram");
  const candidateTwitterHandle = extractSocialHandle(args.twitterUrl, "twitter");
  const candidateWebsiteHost = normalizeHostname(args.websiteUrl);

  const artists = await args.db.artist.findMany({
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      instagramUrl: true,
      twitterUrl: true,
    },
  });

  const exactNameMatch = artists.find((artist) => normalizeName(artist.name) === normalizedCandidateName);
  if (exactNameMatch) {
    return { artistId: exactNameMatch.id, matchType: "exact_name" };
  }

  if (candidateInstagramHandle || candidateTwitterHandle) {
    const socialHandleMatch = artists.find((artist) => {
      const artistInstagramHandle = extractSocialHandle(artist.instagramUrl, "instagram");
      const artistTwitterHandle = extractSocialHandle(artist.twitterUrl, "twitter");

      return (
        (candidateInstagramHandle && artistInstagramHandle === candidateInstagramHandle)
        || (candidateTwitterHandle && artistTwitterHandle === candidateTwitterHandle)
      );
    });

    if (socialHandleMatch) {
      return { artistId: socialHandleMatch.id, matchType: "social_handle" };
    }
  }

  if (candidateWebsiteHost) {
    const websiteHostMatch = artists.find((artist) => normalizeHostname(artist.websiteUrl) === candidateWebsiteHost);
    if (websiteHostMatch) {
      return { artistId: websiteHostMatch.id, matchType: "website_host" };
    }
  }

  return null;
}
