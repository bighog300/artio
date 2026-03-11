import { IngestError } from "@/lib/ingest/errors";
import { assertSafeUrl } from "@/lib/ingest/url-guard";

type FetchImageOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowSvg?: boolean;
  fetchImpl?: typeof fetch;
  assertSafeUrlImpl?: typeof assertSafeUrl;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = Number.parseInt(process.env.AI_INGEST_IMAGE_MAX_BYTES ?? "5000000", 10) || 5_000_000;
const DEFAULT_MAX_REDIRECTS = 5;

async function readBodyLimited(response: Response, maxBytes: number): Promise<{ bytes: Uint8Array; sizeBytes: number }> {
  if (!response.body) {
    return { bytes: new Uint8Array(), sizeBytes: 0 };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let sizeBytes = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    sizeBytes += value.byteLength;
    if (sizeBytes > maxBytes) {
      await reader.cancel();
      throw new IngestError("FETCH_TOO_LARGE", "Image response exceeded byte limit", { maxBytes });
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(sizeBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { bytes: merged, sizeBytes };
}

export async function fetchImageWithGuards(url: string, opts: FetchImageOptions = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const allowSvg = opts.allowSvg ?? false;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const assertSafeUrlImpl = opts.assertSafeUrlImpl ?? assertSafeUrl;

  let currentUrl = (await assertSafeUrlImpl(url)).toString();

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "user-agent": "ArtioIngestBot/1.0 (+https://artio.co)",
          accept: "image/*",
        },
        signal: abortController.signal,
      });
      clearTimeout(timeout);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new IngestError("FETCH_FAILED", "Redirect response missing location header", { status: response.status });
        if (redirectCount === maxRedirects) throw new IngestError("FETCH_FAILED", "Too many redirects", { maxRedirects });
        currentUrl = (await assertSafeUrlImpl(new URL(location, currentUrl).toString())).toString();
        continue;
      }

      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.startsWith("image/")) {
        throw new IngestError("UNSUPPORTED_CONTENT_TYPE", "Only image responses are supported", { contentType });
      }
      if (!allowSvg && contentType.startsWith("image/svg+xml")) {
        throw new IngestError("UNSUPPORTED_CONTENT_TYPE", "SVG images are not supported", { contentType });
      }

      const { bytes, sizeBytes } = await readBodyLimited(response, maxBytes);
      return { bytes, contentType, finalUrl: currentUrl, sizeBytes };
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof IngestError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new IngestError("FETCH_TIMEOUT", "Timed out fetching image URL", { timeoutMs });
      }
      throw new IngestError("FETCH_FAILED", "Unable to fetch image URL", {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new IngestError("FETCH_FAILED", "Unexpected fetch redirect flow");
}
