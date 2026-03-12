const TRACKING_PARAMS = new Set(["fbclid", "gclid", "ref", "source"]);

export function canonicalizeUrl(url: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const pathname = parsed.pathname !== "/" ? parsed.pathname.replace(/\/+$/, "") || "/" : "/";

  for (const key of [...parsed.searchParams.keys()]) {
    const normalized = key.toLowerCase();
    if (normalized.startsWith("utm_") || TRACKING_PARAMS.has(normalized)) {
      parsed.searchParams.delete(key);
    }
  }

  parsed.protocol = "https:";
  parsed.hostname = hostname;
  parsed.pathname = pathname;
  parsed.hash = "";

  return parsed.toString();
}
