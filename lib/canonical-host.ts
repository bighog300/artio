export function getCanonicalHost(): string | null {
  const configuredUrl = process.env.NEXTAUTH_URL;
  if (!configuredUrl) return null;

  try {
    return new URL(configuredUrl).host;
  } catch {
    return null;
  }
}

export function shouldEnforceCanonicalHost(host: string): boolean {
  if (process.env.NODE_ENV !== "production") return false;

  const normalizedHost = host.toLowerCase();
  if (normalizedHost.includes("localhost") || normalizedHost.includes("127.0.0.1")) {
    return false;
  }

  return true;
}
