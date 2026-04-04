import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { logWarn } from "@/lib/logging";

export type SessionUserLike = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
};

function normalizeSessionEmail(email?: string | null) {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized.length ? normalized : null;
}

export async function ensureDbUserForSession(sessionUser: SessionUserLike | null | undefined): Promise<User | null> {
  const sessionId = sessionUser?.id?.trim() || null;
  const normalizedEmail = normalizeSessionEmail(sessionUser?.email);

  if (!sessionId && !normalizedEmail) return null;

  try {
    if (sessionId) {
      const userById = await db.user.findUnique({ where: { id: sessionId } });
      if (userById) return userById;
    }

    if (normalizedEmail) {
      const userByEmail = await db.user.findUnique({ where: { email: normalizedEmail } });
      if (userByEmail) return userByEmail;

      return db.user.upsert({
        where: { email: normalizedEmail },
        update: {
          ...(sessionUser?.name ? { name: sessionUser.name } : {}),
        },
        create: {
          email: normalizedEmail,
          username: normalizedEmail.split("@")[0],
          name: sessionUser?.name ?? null,
          displayName: sessionUser?.name ?? null,
          role: "USER",
        },
      });
    }
  } catch (error) {
    logWarn({
      message: "ensure_db_user_for_session_failed",
      sessionUserId: sessionId,
      sessionUserEmail: normalizedEmail,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return null;
}
