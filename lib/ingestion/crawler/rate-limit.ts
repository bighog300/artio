import { redisGet, redisSetEx, redisSetNx, safeRedisCall } from "@/lib/ingestion/jobs/redis";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withDomainRateLimit<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const host = new URL(url).hostname.toLowerCase();
  const lockKey = `ingest:domain:lock:${host}`;
  const nextAllowedKey = `ingest:domain:next:${host}`;

  const maxWaitMs = 20_000;
  const started = Date.now();

  while (true) {
    const acquired = await safeRedisCall(() => redisSetNx(lockKey, "1", 20), true, "domain_lock_fallback");
    if (acquired) break;
    if (Date.now() - started > maxWaitMs) {
      throw new Error(`domain_lock_timeout:${host}`);
    }
    await sleep(250);
  }

  try {
    const nextAllowedRaw = await safeRedisCall(() => redisGet(nextAllowedKey), null, "domain_next_allowed_get");
    const nextAllowed = nextAllowedRaw ? Number.parseInt(nextAllowedRaw, 10) : 0;

    if (Number.isFinite(nextAllowed) && nextAllowed > Date.now()) {
      await sleep(nextAllowed - Date.now());
    }

    const response = await fn();

    const delayMs = 2_000 + Math.floor(Math.random() * 3_000);
    await safeRedisCall(() => redisSetEx(nextAllowedKey, 120, String(Date.now() + delayMs)), undefined, "domain_next_allowed_set");
    return response;
  } finally {
    // lock expires by TTL; this avoids stuck locks when workers crash.
  }
}
