import { getServerSession, type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { db } from "@/lib/db";
import type { VenueMembershipRole } from "@prisma/client";
import { hasMinimumVenueRole } from "@/lib/ownership";
import { logWarn } from "@/lib/logging";
import { trackMetric } from "@/lib/telemetry";
import { getBetaConfig, isEmailAllowed, normalizeEmail } from "@/lib/beta/access";
import { getAuthDebugRequestMeta, logAuthDebug } from "@/lib/auth-debug";

export type SessionUser = { id: string; email: string; name: string | null; role: "USER" | "EDITOR" | "ADMIN" };

export class AuthError extends Error {
  code = "UNAUTHORIZED" as const;
  status = 401;

  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

export function isAuthError(err: unknown): err is AuthError {
  return err instanceof AuthError;
}

const googleClientId = process.env.AUTH_GOOGLE_ID;
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET;
const isProdLikeEnv = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

let hasWarnedAboutMissingAuthSecret = false;
let hasWarnedAboutSecretMismatch = false;

export function getAuthSecret(): string {
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  const authSecret = process.env.AUTH_SECRET;

  if (isProdLikeEnv && !nextAuthSecret && !authSecret) {
    throw new Error("NEXTAUTH_SECRET (or AUTH_SECRET) is required in production/preview (set a secure random value, e.g. `openssl rand -base64 32`).");
  }

  if (process.env.NODE_ENV !== "production") {
    if (!nextAuthSecret && !authSecret && !hasWarnedAboutMissingAuthSecret) {
      hasWarnedAboutMissingAuthSecret = true;
      console.warn("[auth] NEXTAUTH_SECRET/AUTH_SECRET is not set. Session decryption can fail across environments without a shared secret.");
    }

    if (nextAuthSecret && authSecret && nextAuthSecret !== authSecret && !hasWarnedAboutSecretMismatch) {
      hasWarnedAboutSecretMismatch = true;
      console.warn("[auth] NEXTAUTH_SECRET and AUTH_SECRET differ. Using NEXTAUTH_SECRET; align both values to avoid session decryption issues.");
    }
  }

  return nextAuthSecret ?? authSecret ?? "";
}

const authSecret = getAuthSecret();

const hasAuthConfig = Boolean(authSecret && googleClientId && googleClientSecret);


const authFailureWindowMs = 60_000;
const authFailureState = { windowStart: 0, count: 0 };
let hasWarnedAboutEdgeRuntime = false;

let hasWarnedAboutHostMismatch = false;

function warnAuthEnvRisks(host: string) {
  if (process.env.NODE_ENV === "production") return;

  const configuredUrl = process.env.NEXTAUTH_URL;
  if (!configuredUrl || hasWarnedAboutHostMismatch || !host || host === "unknown") return;

  try {
    const configuredHost = new URL(configuredUrl).host;
    if (configuredHost !== host) {
      hasWarnedAboutHostMismatch = true;
      console.warn(`[auth] Request host (${host}) differs from NEXTAUTH_URL host (${configuredHost}). Session cookies may not be sent consistently across hosts.`);
    }
  } catch {
    // ignore malformed NEXTAUTH_URL in warning path
  }
}

function isAllowlistedAdminEmail(email: string) {
  const betaConfig = getBetaConfig();
  return betaConfig.adminEmails.has(normalizeEmail(email));
}

function getEffectiveRole(email: string, role: SessionUser["role"]) {
  if (isAllowlistedAdminEmail(email)) return "ADMIN" as const;
  return role;
}

function logRateLimitedAuthFailure() {
  const now = Date.now();
  if (now - authFailureState.windowStart >= authFailureWindowMs) {
    authFailureState.windowStart = now;
    authFailureState.count = 0;
  }
  authFailureState.count += 1;
  if (authFailureState.count <= 3) {
    logWarn({ message: "auth_failure", reason: "missing_session", countInWindow: authFailureState.count });
  }
  trackMetric("auth.failure", 1, { reason: "missing_session" });
}


export const authOptions: NextAuthOptions = {
  secret: authSecret,
  providers: hasAuthConfig
    ? [
        GoogleProvider({
          clientId: googleClientId!,
          clientSecret: googleClientSecret!,
        }),
      ]
    : [],
  session: { strategy: "jwt" },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const betaConfig = getBetaConfig();
      const normalizedEmail = normalizeEmail(user.email);
      const isAdminEmail = betaConfig.adminEmails.has(normalizedEmail);

      if (betaConfig.betaMode && !isEmailAllowed(normalizedEmail, betaConfig)) {
        return false;
      }

      await db.user.upsert({
        where: { email: normalizedEmail },
        update: {
          name: user.name ?? undefined,
          imageUrl: user.image ?? undefined,
          ...(isAdminEmail ? { role: "ADMIN" } : {}),
        },
        create: {
          email: normalizedEmail,
          name: user.name,
          imageUrl: user.image,
          role: isAdminEmail ? "ADMIN" : "USER",
        },
      });
      return true;
    },
    async jwt({ token }) {
      if (!token.email) return token;
      const normalizedEmail = normalizeEmail(token.email);
      const dbUser = await db.user.findUnique({ where: { email: normalizedEmail } });
      if (dbUser) {
        token.sub = dbUser.id;
        token.role = getEffectiveRole(normalizedEmail, dbUser.role as SessionUser["role"]);
        token.name = dbUser.name ?? token.name;
      } else {
        token.role = getEffectiveRole(normalizedEmail, "USER");
      }
      return token;
    },
    async session({ session, token }) {
      if (!session.user || !token.sub || !token.email) return session;
      session.user.id = token.sub;
      session.user.email = token.email;
      session.user.name = token.name ?? null;
      session.user.role = (token.role as SessionUser["role"]) || "USER";
      return session;
    },
  },
  pages: { signIn: "/login" },
};

export async function getSessionUser(): Promise<SessionUser | null> {
  if (process.env.NODE_ENV !== "production" && !hasWarnedAboutEdgeRuntime) {
    const isEdgeRuntime = process.env.NEXT_RUNTIME === "edge" || typeof (globalThis as { EdgeRuntime?: string }).EdgeRuntime !== "undefined";
    if (isEdgeRuntime) {
      hasWarnedAboutEdgeRuntime = true;
      console.warn("[auth] getSessionUser() is running in Edge runtime; use `export const runtime = \"nodejs\"` on auth-gated routes.");
    }
  }

  const session = await getServerSession(authOptions);
  const user = !session?.user?.id || !session.user.email
    ? null
    : {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? null,
        role: session.user.role || "USER",
      };

  const requestMeta = await getAuthDebugRequestMeta();
  warnAuthEnvRisks(requestMeta.host);
  logAuthDebug("getSessionUser", {
    ...requestMeta,
    userExists: Boolean(user),
    redirectTarget: null,
  });

  return user;
}

export async function requireAuth() {
  const user = await getSessionUser();
  if (!user) {
    logRateLimitedAuthFailure();
    throw new AuthError();
  }
  return user;
}

export async function requireUser() {
  return requireAuth();
}

export async function isVenueMember(userId: string, venueId: string) {
  const membership = await db.venueMembership.findUnique({
    where: { userId_venueId: { userId, venueId } },
    select: { role: true },
  });
  return membership;
}

export async function requireVenueRole(venueId: string, minRole: VenueMembershipRole = "EDITOR") {
  const user = await requireAuth();
  if (hasGlobalVenueAccess(user.role)) return user;

  const membership = await isVenueMember(user.id, venueId);
  if (!membership) throw new Error("forbidden");
  if (!hasMinimumVenueRole(membership.role, minRole)) throw new Error("forbidden");

  return user;
}

export function hasGlobalVenueAccess(role: SessionUser["role"]) {
  return role === "EDITOR" || role === "ADMIN";
}

export async function requireEditor() {
  const user = await requireAuth();
  if (user.role !== "EDITOR" && user.role !== "ADMIN") throw new Error("forbidden");
  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== "ADMIN") throw new Error("forbidden");
  return user;
}

export function assertAuthConfig() {
  return hasAuthConfig;
}
