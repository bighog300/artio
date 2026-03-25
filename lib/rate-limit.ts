import { NextRequest, NextResponse } from "next/server";

type WindowState = { windowStart: number; count: number };

const memoryStore = new Map<string, WindowState>();


let hasWarnedAboutMemoryFallback = false;

function isProductionLikeEnv() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function warnRateLimitMemoryFallbackOnce() {
  if (!isProductionLikeEnv() || hasWarnedAboutMemoryFallback) return;
  hasWarnedAboutMemoryFallback = true;
  console.warn("[rate-limit] Upstash Redis is not configured or unavailable in production-like runtime; falling back to in-memory rate limiting.");
}

export function __resetRateLimitWarningsForTests() {
  hasWarnedAboutMemoryFallback = false;
}

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

export class RateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }

  toBody() {
    return {
      error: "rate_limited",
      message: this.message,
      retryAfterSeconds: this.retryAfterSeconds,
    };
  }
}

function getWindowKey(key: string, windowMs: number, nowMs: number) {
  return `rl:${key}:${Math.floor(nowMs / windowMs)}`;
}

async function redisIncr(key: string, windowMs: number) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const nowMs = Date.now();
  const windowKey = getWindowKey(key, windowMs, nowMs);
  const baseUrl = url.replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${token}` };

  const incrResp = await fetch(`${baseUrl}/incr/${encodeURIComponent(windowKey)}`, { headers, cache: "no-store" });
  if (!incrResp.ok) throw new Error("upstash_incr_failed");
  const incrData = (await incrResp.json()) as { result?: number };
  const count = Number(incrData.result ?? 0);

  if (count === 1) {
    await fetch(`${baseUrl}/pexpire/${encodeURIComponent(windowKey)}/${windowMs}`, { headers, cache: "no-store" });
  }

  const ttlResp = await fetch(`${baseUrl}/pttl/${encodeURIComponent(windowKey)}`, { headers, cache: "no-store" });
  const ttlData = ttlResp.ok ? ((await ttlResp.json()) as { result?: number }) : { result: windowMs };
  const ttlMs = Math.max(Number(ttlData.result ?? windowMs), 1);

  return { count, retryAfterSeconds: Math.max(Math.ceil(ttlMs / 1000), 1) };
}

function memoryIncr(key: string, windowMs: number) {
  const nowMs = Date.now();
  const current = memoryStore.get(key);

  if (!current || nowMs - current.windowStart >= windowMs) {
    memoryStore.set(key, { windowStart: nowMs, count: 1 });
    return { count: 1, retryAfterSeconds: Math.max(Math.ceil(windowMs / 1000), 1) };
  }

  current.count += 1;
  memoryStore.set(key, current);
  const retryAfterMs = Math.max(current.windowStart + windowMs - nowMs, 1);
  return { count: current.count, retryAfterSeconds: Math.max(Math.ceil(retryAfterMs / 1000), 1) };
}

async function consumeRateLimit(options: RateLimitOptions) {
  const redisResult = await redisIncr(options.key, options.windowMs).catch(() => null);
  if (redisResult) return redisResult;

  if (isProductionLikeEnv()) {
    throw new Error("[rate-limit] Upstash Redis is unavailable in production. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");
  }

  warnRateLimitMemoryFallbackOnce();
  return memoryIncr(options.key, options.windowMs);
}

export async function enforceRateLimit(options: RateLimitOptions) {
  const { count, retryAfterSeconds } = await consumeRateLimit(options);
  if (count <= options.limit) return;

  throw new RateLimitError(`Rate limit exceeded for ${options.key}`, retryAfterSeconds);
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

export function rateLimitErrorResponse(error: RateLimitError) {
  return NextResponse.json(error.toBody(), {
    status: 429,
    headers: { "Retry-After": String(error.retryAfterSeconds) },
  });
}

export function requestClientIp(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function principalRateLimitKey(req: NextRequest, scope: string, userId?: string | null) {
  if (userId) return `${scope}:user:${userId}`;
  return `${scope}:ip:${requestClientIp(req)}`;
}

export const RATE_LIMITS = {
  followsWrite: {
    limit: Number(process.env.RATE_LIMIT_FOLLOWS_WRITE_PER_MINUTE ?? 60),
    windowMs: Number(process.env.RATE_LIMIT_FOLLOWS_WRITE_WINDOW_MS ?? 60_000),
  },
  favoritesWrite: {
    limit: Number(process.env.RATE_LIMIT_FAVORITES_WRITE_PER_MINUTE ?? 60),
    windowMs: Number(process.env.RATE_LIMIT_FAVORITES_WRITE_WINDOW_MS ?? 60_000),
  },
  invitesCreate: {
    limit: Number(process.env.RATE_LIMIT_INVITES_CREATE_PER_HOUR ?? 10),
    windowMs: Number(process.env.RATE_LIMIT_INVITES_CREATE_WINDOW_MS ?? 3_600_000),
  },
  submissions: {
    limit: Number(process.env.RATE_LIMIT_SUBMISSIONS_PER_HOUR ?? 30),
    windowMs: Number(process.env.RATE_LIMIT_SUBMISSIONS_WINDOW_MS ?? 3_600_000),
  },
  uploads: {
    limit: Number(process.env.RATE_LIMIT_UPLOADS_PER_HOUR ?? 30),
    windowMs: Number(process.env.RATE_LIMIT_UPLOADS_WINDOW_MS ?? 3_600_000),
  },
  engagementWrite: {
    limit: Number(process.env.RATE_LIMIT_ENGAGEMENT_WRITE_PER_MINUTE ?? 120),
    windowMs: Number(process.env.RATE_LIMIT_ENGAGEMENT_WRITE_WINDOW_MS ?? 60_000),
  },
  venueImagesWrite: {
    limit: Number(process.env.RATE_LIMIT_VENUE_IMAGES_WRITE_PER_MINUTE ?? 60),
    windowMs: Number(process.env.RATE_LIMIT_VENUE_IMAGES_WRITE_WINDOW_MS ?? 60_000),
  },
  artistImagesWrite: {
    limit: Number(process.env.RATE_LIMIT_ARTIST_IMAGES_WRITE_PER_MINUTE ?? 60),
    windowMs: Number(process.env.RATE_LIMIT_ARTIST_IMAGES_WRITE_WINDOW_MS ?? 60_000),
  },
  artistProfileWrite: {
    limit: Number(process.env.RATE_LIMIT_ARTIST_PROFILE_WRITE_PER_MINUTE ?? 30),
    windowMs: Number(process.env.RATE_LIMIT_ARTIST_PROFILE_WRITE_WINDOW_MS ?? 60_000),
  },
  artistSubmitWrite: {
    limit: Number(process.env.RATE_LIMIT_ARTIST_SUBMIT_WRITE_PER_HOUR ?? 20),
    windowMs: Number(process.env.RATE_LIMIT_ARTIST_SUBMIT_WRITE_WINDOW_MS ?? 3_600_000),
  },
  venueSubmitWrite: {
    limit: Number(process.env.RATE_LIMIT_VENUE_SUBMIT_WRITE_PER_HOUR ?? 20),
    windowMs: Number(process.env.RATE_LIMIT_VENUE_SUBMIT_WRITE_WINDOW_MS ?? 3_600_000),
  },
  eventSubmitWrite: {
    limit: Number(process.env.RATE_LIMIT_EVENT_SUBMIT_WRITE_PER_HOUR ?? 30),
    windowMs: Number(process.env.RATE_LIMIT_EVENT_SUBMIT_WRITE_WINDOW_MS ?? 3_600_000),
  },
  artistVenueAssocWrite: {
    limit: Number(process.env.RATE_LIMIT_ARTIST_VENUE_ASSOC_WRITE_PER_HOUR ?? 30),
    windowMs: Number(process.env.RATE_LIMIT_ARTIST_VENUE_ASSOC_WRITE_WINDOW_MS ?? 3_600_000),
  },
  venueAssocModerationWrite: {
    limit: Number(process.env.RATE_LIMIT_VENUE_ASSOC_MODERATION_WRITE_PER_HOUR ?? 60),
    windowMs: Number(process.env.RATE_LIMIT_VENUE_ASSOC_MODERATION_WRITE_WINDOW_MS ?? 3_600_000),
  },
  eventRevisionWrite: {
    limit: Number(process.env.RATE_LIMIT_EVENT_REVISION_WRITE_PER_HOUR ?? 30),
    windowMs: Number(process.env.RATE_LIMIT_EVENT_REVISION_WRITE_WINDOW_MS ?? 3_600_000),
  },
  eventRegisterWrite: {
    limit: Number(process.env.RATE_LIMIT_EVENT_REGISTER_WRITE_PER_HOUR ?? 30),
    windowMs: Number(process.env.RATE_LIMIT_EVENT_REGISTER_WRITE_WINDOW_MS ?? 3_600_000),
  },
  recommendationsEvents: {
    limit: Number(process.env.RATE_LIMIT_RECOMMENDATIONS_EVENTS_PER_MINUTE ?? 45),
    windowMs: Number(process.env.RATE_LIMIT_RECOMMENDATIONS_EVENTS_WINDOW_MS ?? 60_000),
  },
  expensiveReads: {
    limit: Number(process.env.RATE_LIMIT_EXPENSIVE_READS_PER_MINUTE ?? 120),
    windowMs: Number(process.env.RATE_LIMIT_EXPENSIVE_READS_WINDOW_MS ?? 60_000),
  },
  adminPerfExplain: {
    limit: Number(process.env.RATE_LIMIT_ADMIN_PERF_EXPLAIN_PER_MINUTE ?? 10),
    windowMs: Number(process.env.RATE_LIMIT_ADMIN_PERF_EXPLAIN_WINDOW_MS ?? 60_000),
  },
  betaRequestAccess: {
    limit: Number(process.env.RATE_LIMIT_BETA_REQUEST_ACCESS_PER_HOUR ?? 5),
    windowMs: Number(process.env.RATE_LIMIT_BETA_REQUEST_ACCESS_WINDOW_MS ?? 3_600_000),
  },
  betaFeedback: {
    limit: Number(process.env.RATE_LIMIT_BETA_FEEDBACK_PER_HOUR ?? 10),
    windowMs: Number(process.env.RATE_LIMIT_BETA_FEEDBACK_WINDOW_MS ?? 3_600_000),
  },
  analyticsViewWrite: {
    limit: Number(process.env.RATE_LIMIT_ANALYTICS_VIEW_WRITE_PER_MINUTE ?? 120),
    windowMs: Number(process.env.RATE_LIMIT_ANALYTICS_VIEW_WRITE_WINDOW_MS ?? 60_000),
  },
  publicRead: {
    limit: Number(process.env.RATE_LIMIT_PUBLIC_READ_PER_MINUTE ?? 120),
    windowMs: Number(process.env.RATE_LIMIT_PUBLIC_READ_WINDOW_MS ?? 60_000),
  },
  publicWrite: {
    limit: Number(process.env.RATE_LIMIT_PUBLIC_WRITE_PER_HOUR ?? 10),
    windowMs: Number(process.env.RATE_LIMIT_PUBLIC_WRITE_WINDOW_MS ?? 3_600_000),
  },

} as const;
