export function resolveRelativeHttpUrl(url: string | null | undefined, baseUrl: string | null | undefined): string | null {
  if (!url) return null;

  const trimmed = url.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();
  if (lowered.startsWith("http://") || lowered.startsWith("https://")) {
    return trimmed;
  }

  if (!baseUrl) return null;

  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}
