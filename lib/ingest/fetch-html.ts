import { IngestError } from "@/lib/ingest/errors";
import { assertSafeUrl } from "@/lib/ingest/url-guard";

type FetchHtmlOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_MAX_REDIRECTS = 5;

async function readBodyLimited(response: Response, maxBytes: number): Promise<{ html: string; bytes: number }> {
  if (!response.body) {
    return { html: "", bytes: 0 };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;

    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new IngestError("FETCH_TOO_LARGE", "Response body exceeded byte limit", { maxBytes });
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { html: new TextDecoder().decode(merged), bytes };
}

function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const lower = contentType.toLowerCase();
  return lower.includes("text/html") || lower.includes("application/xhtml+xml");
}

export async function fetchHtmlWithGuards(url: string, opts: FetchHtmlOptions = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let currentUrl = (await assertSafeUrl(url)).toString();

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "user-agent": "ArtioIngestBot/1.0 (+https://artio.co)",
          accept: "text/html,application/xhtml+xml",
        },
        signal: abortController.signal,
      });
      clearTimeout(timeout);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new IngestError("FETCH_FAILED", "Redirect response missing location header", { status: response.status });
        }
        if (redirectCount === maxRedirects) {
          throw new IngestError("FETCH_FAILED", "Too many redirects", { maxRedirects });
        }

        currentUrl = (await assertSafeUrl(new URL(location, currentUrl).toString())).toString();
        continue;
      }

      const contentType = response.headers.get("content-type");
      if (!isHtmlContentType(contentType)) {
        throw new IngestError("UNSUPPORTED_CONTENT_TYPE", "Only HTML documents are supported", { contentType });
      }

      const { html, bytes } = await readBodyLimited(response, maxBytes);
      return {
        finalUrl: currentUrl,
        status: response.status,
        contentType,
        bytes,
        html,
      };
    } catch (error) {
      clearTimeout(timeout);
      if (error instanceof IngestError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new IngestError("FETCH_TIMEOUT", "Timed out fetching URL", { timeoutMs });
      }
      throw new IngestError("FETCH_FAILED", "Unable to fetch URL", {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new IngestError("FETCH_FAILED", "Unexpected fetch redirect flow");
}
