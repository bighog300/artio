import type { Prisma, Role } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";

const adminUsersQuerySchema = z.object({
  query: z.string().trim().max(100).optional(),
});

const roleUpdateBodySchema = z.object({
  role: z.enum(["USER", "EDITOR", "ADMIN"]),
  manualOverride: z.boolean().optional(),
});

const roleUpdateParamsSchema = z.object({
  id: z.string().uuid(),
});

const trustedPublisherUpdateBodySchema = z.object({
  enabled: z.boolean(),
});

type AdminActor = { id: string; email: string; role: "USER" | "EDITOR" | "ADMIN" };

type AdminUsersDeps = {
  requireAdminUser: () => Promise<AdminActor>;
  appDb: typeof db;
};

const roleWeight: Record<Role, number> = { USER: 0, EDITOR: 1, ADMIN: 2 };

function getRequestDetails(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0]?.trim() : req.headers.get("x-real-ip");
  const userAgent = req.headers.get("user-agent");
  return { ip: ip || null, userAgent: userAgent || null };
}

export async function handleAdminUsersSearch(req: NextRequest, deps: AdminUsersDeps) {
  try {
    await deps.requireAdminUser();

    const url = new URL(req.url);
    const parsedQuery = adminUsersQuerySchema.safeParse({ query: url.searchParams.get("query") ?? undefined });
    if (!parsedQuery.success) {
      return apiError(400, "invalid_query", "Invalid query parameter");
    }

    const query = parsedQuery.data.query ?? "";

    const users = await deps.appDb.user.findMany({
      where: query
        ? {
            OR: [
              { email: { contains: query, mode: "insensitive" } },
              { name: { contains: query, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isTrustedPublisher: true,
        trustedPublisherSince: true,
        trustedPublisherById: true,
        trustedPublisherBy: { select: { id: true, email: true, name: true } },
        createdAt: true,
      },
    });

    return NextResponse.json({ users });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return apiError(401, "unauthorized", "Authentication required");
    }
    if (error instanceof Error && error.message === "forbidden") {
      return apiError(403, "forbidden", "Admin role required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function handleAdminUserRoleUpdate(req: NextRequest, params: { id: string }, deps: AdminUsersDeps) {
  try {
    const actor = await deps.requireAdminUser();

    const parsedParams = roleUpdateParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return apiError(400, "invalid_user_id", "Invalid user id");
    }

    const parsedBody = roleUpdateBodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return apiError(400, "invalid_body", "Invalid role");
    }

    const targetUser = await deps.appDb.user.findUnique({
      where: { id: parsedParams.data.id },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!targetUser) {
      return apiError(404, "not_found", "User not found");
    }

    if (targetUser.role === parsedBody.data.role) {
      return NextResponse.json({ success: true, user: targetUser });
    }

    const isElevation = roleWeight[parsedBody.data.role] > roleWeight[targetUser.role];
    if (isElevation && parsedBody.data.manualOverride !== true) {
      return apiError(
        409,
        "use_access_request_flow",
        "Direct role elevation is disabled. Use the access request approval flow or pass manualOverride=true for break-glass changes.",
      );
    }

    const { ip, userAgent } = getRequestDetails(req);

    const updatedUser = await deps.appDb.$transaction(async (tx) => {
      if (targetUser.role === "ADMIN" && parsedBody.data.role !== "ADMIN") {
        const adminCount = await tx.user.count({ where: { role: "ADMIN" } });
        if (adminCount <= 1) {
          throw new Error("cannot_demote_last_admin");
        }
      }

      const user = await tx.user.update({
        where: { id: targetUser.id },
        data: { role: parsedBody.data.role as Role },
        select: { id: true, email: true, name: true, role: true },
      });

      const metadata = {
        actorUserId: actor.id,
        actorEmail: actor.email,
        targetUserId: user.id,
        beforeRole: targetUser.role,
        afterRole: user.role,
        ip,
        userAgent,
      } satisfies Prisma.InputJsonValue;

      await tx.adminAuditLog.create({
        data: {
          actorEmail: actor.email,
          action: isElevation ? "USER_ROLE_CHANGED_MANUAL_OVERRIDE" : "USER_ROLE_CHANGED",
          targetType: "user",
          targetId: user.id,
          metadata,
          ip,
          userAgent,
        },
      });

      return user;
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return apiError(401, "unauthorized", "Authentication required");
    }
    if (error instanceof Error && error.message === "forbidden") {
      return apiError(403, "forbidden", "Admin role required");
    }
    if (error instanceof Error && error.message === "cannot_demote_last_admin") {
      return apiError(409, "cannot_demote_last_admin", "Cannot demote the last admin");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}


export async function handleAdminTrustedPublisherUpdate(req: NextRequest, params: { id: string }, deps: AdminUsersDeps) {
  try {
    const actor = await deps.requireAdminUser();

    const parsedParams = roleUpdateParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return apiError(400, "invalid_user_id", "Invalid user id");
    }

    const parsedBody = trustedPublisherUpdateBodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return apiError(400, "invalid_body", "Invalid trusted publisher payload");
    }

    const targetUser = await deps.appDb.user.findUnique({
      where: { id: parsedParams.data.id },
      select: {
        id: true,
        email: true,
        name: true,
        isTrustedPublisher: true,
        trustedPublisherSince: true,
        trustedPublisherById: true,
        trustedPublisherBy: { select: { id: true, email: true, name: true } },
      },
    });

    if (!targetUser) {
      return apiError(404, "not_found", "User not found");
    }

    const { enabled } = parsedBody.data;
    if (targetUser.isTrustedPublisher === enabled) {
      return NextResponse.json({ success: true, user: targetUser });
    }

    const { ip, userAgent } = getRequestDetails(req);

    const updatedUser = await deps.appDb.$transaction(async (tx) => {
      const now = new Date();
      const user = await tx.user.update({
        where: { id: targetUser.id },
        data: enabled
          ? { isTrustedPublisher: true, trustedPublisherSince: now, trustedPublisherById: actor.id, sessionRevokedAt: now }
          : { isTrustedPublisher: false, sessionRevokedAt: now },
        select: {
          id: true,
          email: true,
          name: true,
          isTrustedPublisher: true,
          trustedPublisherSince: true,
          trustedPublisherById: true,
          trustedPublisherBy: { select: { id: true, email: true, name: true } },
        },
      });

      const metadata = {
        actorUserId: actor.id,
        actorEmail: actor.email,
        targetUserId: user.id,
        beforeEnabled: targetUser.isTrustedPublisher,
        afterEnabled: user.isTrustedPublisher,
        trustedPublisherSince: user.trustedPublisherSince?.toISOString() ?? null,
        trustedPublisherById: user.trustedPublisherById,
        ip,
        userAgent,
      } satisfies Prisma.InputJsonValue;

      await tx.adminAuditLog.create({
        data: {
          actorEmail: actor.email,
          action: enabled ? "USER_TRUSTED_PUBLISHER_GRANTED" : "USER_TRUSTED_PUBLISHER_REVOKED",
          targetType: "user",
          targetId: user.id,
          metadata,
          ip,
          userAgent,
        },
      });

      return user;
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return apiError(401, "unauthorized", "Authentication required");
    }
    if (error instanceof Error && error.message === "forbidden") {
      return apiError(403, "forbidden", "Admin role required");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
