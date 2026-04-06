import { logWarn } from "@/lib/logging";

const DEFAULT_TIMEOUT_MS = 8_000;

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? null;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? null;
  return { url, token };
}

async function postCommand(args: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  const { url, token } = getRedisConfig();
  if (!url || !token) {
    throw new Error("missing_redis_rest_credentials");
  }

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([[...args]]),
      signal: abort.signal,
    });

    if (!response.ok) {
      throw new Error(`upstash_command_failed:${response.status}`);
    }

    const body = await response.json() as Array<{ result?: unknown; error?: string }>;
    const result = body?.[0];
    if (!result) throw new Error("upstash_empty_response");
    if (result.error) throw new Error(`upstash_error:${result.error}`);
    return result.result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function redisSetNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  const result = await postCommand(["SET", key, value, "NX", "EX", String(Math.max(1, ttlSeconds))]);
  return result === "OK";
}

export async function redisLpush(listKey: string, value: string): Promise<number> {
  const result = await postCommand(["LPUSH", listKey, value]);
  const numeric = Number(result);
  if (!Number.isFinite(numeric)) throw new Error("upstash_lpush_non_numeric");
  return numeric;
}

export async function redisRpop(listKey: string): Promise<string | null> {
  const result = await postCommand(["RPOP", listKey]);
  if (result == null) return null;
  if (typeof result !== "string") return String(result);
  return result;
}

export async function redisSetEx(key: string, ttlSeconds: number, value: string): Promise<void> {
  await postCommand(["SET", key, value, "EX", String(Math.max(1, ttlSeconds))]);
}

export async function redisGet(key: string): Promise<string | null> {
  const result = await postCommand(["GET", key]);
  if (result == null) return null;
  return typeof result === "string" ? result : String(result);
}

export async function safeRedisCall<T>(fn: () => Promise<T>, fallback: T, context: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logWarn({ message: "ingestion_redis_call_failed", context, error: error instanceof Error ? error.message : String(error) });
    return fallback;
  }
}
