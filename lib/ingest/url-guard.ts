import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { IngestError } from "@/lib/ingest/errors";

type LookupResult = { address: string; family: number };

type UrlGuardDeps = {
  lookupAll?: (hostname: string) => Promise<LookupResult[]>;
};

function isPrivateIpv4(input: string): boolean {
  const parts = input.split(".").map((value) => Number.parseInt(value, 10));
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return true;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 ||
    a === 192 && b === 0 && parts[2] === 0 ||
    a === 192 && b === 0 && parts[2] === 2 ||
    a === 192 && b === 168 ||
    a === 198 && (b === 18 || b === 19) ||
    a === 198 && b === 51 && parts[2] === 100 ||
    a === 203 && b === 0 && parts[2] === 113 ||
    a >= 224
  );
}

function normalizeIpv6(input: string): string {
  return input.toLowerCase();
}

function isPrivateIpv6(input: string): boolean {
  const normalized = normalizeIpv6(input);
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff")
  );
}

function assertSafeIp(address: string): void {
  const family = isIP(address);
  if (!family) {
    throw new IngestError("INVALID_URL", "Resolved address is not an IP", { address });
  }

  if (family === 4 && isPrivateIpv4(address)) {
    throw new IngestError("DNS_PRIVATE_IP", "Resolved IPv4 address is not publicly routable", { address });
  }

  if (family === 6 && isPrivateIpv6(address)) {
    throw new IngestError("DNS_PRIVATE_IP", "Resolved IPv6 address is not publicly routable", { address });
  }
}

function assertSafeHostname(url: URL): void {
  const hostname = url.hostname.toLowerCase();
  const normalizedHost = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (normalizedHost === "localhost") {
    throw new IngestError("UNSAFE_URL", "Localhost is not allowed", { hostname });
  }

  if (normalizedHost.endsWith(".localhost") || normalizedHost.endsWith(".local")) {
    throw new IngestError("UNSAFE_URL", "Local domains are not allowed", { hostname });
  }

  if (normalizedHost.includes("%")) {
    throw new IngestError("INVALID_URL", "URL hostname encoding is invalid");
  }

  const literalFamily = isIP(normalizedHost);
  if (literalFamily) {
    assertSafeIp(normalizedHost);
  }
}

export async function assertSafeUrl(input: string, deps: UrlGuardDeps = {}): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new IngestError("INVALID_URL", "Invalid URL", { input });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new IngestError("INVALID_URL", "Only http and https URLs are supported", { protocol: parsed.protocol });
  }

  assertSafeHostname(parsed);

  const resolver = deps.lookupAll ?? (async (hostname: string) => lookup(hostname, { all: true }));
  const results = await resolver(parsed.hostname);
  if (!results.length) {
    throw new IngestError("FETCH_FAILED", "Hostname did not resolve", { hostname: parsed.hostname });
  }

  for (const result of results) {
    assertSafeIp(result.address);
  }

  return parsed;
}
