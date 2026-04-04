import type { AccessRequestStatus, Prisma, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { accessRequestCreateSchema, accessRequestRejectionSchema, idParamSchema, parseBody, zodDetails } from "@/lib/validators";

type SessionUser = { id: string; email: string; role: "USER" | "EDITOR" | "ADMIN" };

type AccessRequestDeps = {
  appDb: typeof db;
};

// AccessRequestedRole is the public-facing vocabulary shown in the request UI.
// It maps onto the internal platform Role enum as follows:
//   VIEWER    -> USER   (read-only access)
//   MODERATOR -> EDITOR (can review and publish content)
//   OPERATOR  -> EDITOR (same platform permissions as MODERATOR for now)
//   ADMIN     -> ADMIN  (full platform access — requires manual override flag)
//
// If the platform Role enum is expanded in future, update this mapping
// and the corresponding tests in test/access-requests-route.test.ts.
const requestedRoleToSystemRole: Record<"viewer" | "moderator" | "operator" | "admin", Role> = {
  viewer: "USER",
  moderator: "EDITOR",
  operator: "EDITOR",
  admin: "ADMIN",
};

function requestedRoleToDbValue(input: "viewer" | "moderator" | "operator" | "admin") {
  return input.toUpperCase() as "VIEWER" | "MODERATOR" | "OPERATOR" | "ADMIN";
}

function getRequestDetails(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0]?.trim() : req.headers.get("x-real-ip");
  const userAgent = req.headers.get("user-agent");
  return { ip: ip || null, userAgent: userAgent || null };
}

function isUniquePendingError(error: unknown) {
  return error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002";
}

export async function handleCreateAccessRequest(req: NextRequest, user: SessionUser, deps: AccessRequestDeps = { appDb: db }) {
  const parsed = accessRequestCreateSchema.safeParse(await parseBody(req));
  if (!parsed.success) {
    return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsed.error));
  }

  const dbUser = await deps.appDb.user.findUnique({ where: { id: user.id }, select: { id: true } });
  // TODO: Replace this missing-user check with an explicit user.status === "SUSPENDED"
  // guard once a suspension status column is added to the User model.
  // Tracking issue: the current schema has no suspension field, so suspended users
  // are indistinguishable from deleted users at the application layer.
  if (!dbUser) return apiError(403, "inactive_user", "User account is not active");

  try {
    const created = await deps.appDb.$transaction(async (tx) => {
      const existingPending = await tx.accessRequest.findFirst({
        where: { userId: user.id, status: "PENDING" },
        select: { id: true },
      });
      if (existingPending) throw new Error("pending_exists");

      const record = await tx.accessRequest.create({
        data: {
          userId: user.id,
          requestedRole: requestedRoleToDbValue(parsed.data.requestedRole),
          status: "PENDING",
          reason: parsed.data.reason?.trim() || null,
        },
      });

      const metadata = {
        userId: user.id,
        requestedRole: record.requestedRole,
        requestId: record.id,
      } satisfies Prisma.InputJsonValue;

      await tx.adminAuditLog.create({
        data: {
          actorEmail: user.email,
          action: "ACCESS_REQUEST_CREATED",
          targetType: "access_request",
          targetId: record.id,
          metadata,
        },
      });

      return record;
    });

    return NextResponse.json({ request: created });
  } catch (error) {
    if (error instanceof Error && error.message === "pending_exists") {
      return apiError(409, "pending_exists", "A pending access request already exists");
    }
    if (isUniquePendingError(error)) {
      return apiError(409, "pending_exists", "A pending access request already exists");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function handleGetMyAccessRequest(user: SessionUser, deps: AccessRequestDeps = { appDb: db }) {
  const latest = await deps.appDb.accessRequest.findFirst({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }],
  });

  // "NONE" is a synthetic status — it is not stored in the database.
  // It is returned here so the client always receives the same response
  // shape regardless of whether a request exists. Do not add "NONE" to
  // the AccessRequestStatus enum in the Prisma schema.
  if (!latest) return NextResponse.json({ state: "NONE", request: null });
  return NextResponse.json({ state: latest.status, request: latest });
}

export async function handleApproveAccessRequest(
  req: NextRequest,
  params: Promise<{ id: string }>,
  actor: SessionUser,
  deps: AccessRequestDeps = { appDb: db },
) {
  const parsedId = idParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));
  const { ip, userAgent } = getRequestDetails(req);

  try {
    const approved = await deps.appDb.$transaction(async (tx) => {
      const request = await tx.accessRequest.findUnique({ where: { id: parsedId.data.id } });
      if (!request) throw new Error("not_found");
      if (request.status !== "PENDING") throw new Error("invalid_transition");

      const updatedRequest = await tx.accessRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: actor.id, rejectionReason: null },
      });

      const before = await tx.user.findUnique({ where: { id: request.userId }, select: { id: true, role: true } });
      if (!before) throw new Error("target_missing");

      const nextRole = requestedRoleToSystemRole[request.requestedRole.toLowerCase() as "viewer" | "moderator" | "operator" | "admin"];
      await tx.user.update({ where: { id: request.userId }, data: { role: nextRole } });

      const metadata = {
        actorUserId: actor.id,
        actorEmail: actor.email,
        requestId: request.id,
        targetUserId: request.userId,
        requestedRole: request.requestedRole,
        beforeRole: before.role,
        afterRole: nextRole,
      } satisfies Prisma.InputJsonValue;

      await tx.adminAuditLog.create({
        data: {
          actorEmail: actor.email,
          action: "ACCESS_REQUEST_APPROVED",
          targetType: "access_request",
          targetId: request.id,
          metadata,
          ip,
          userAgent,
        },
      });

      return updatedRequest;
    });

    return NextResponse.json({ request: approved });
  } catch (error) {
    if (error instanceof Error && error.message === "not_found") return apiError(404, "not_found", "Access request not found");
    if (error instanceof Error && error.message === "invalid_transition") return apiError(409, "invalid_transition", "Only pending requests can be approved");
    if (error instanceof Error && error.message === "target_missing") return apiError(409, "target_missing", "Target user is not active");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function handleRejectAccessRequest(
  req: NextRequest,
  params: Promise<{ id: string }>,
  actor: SessionUser,
  deps: AccessRequestDeps = { appDb: db },
) {
  const parsedId = idParamSchema.safeParse(await params);
  if (!parsedId.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedId.error));

  const parsedBody = accessRequestRejectionSchema.safeParse(await parseBody(req));
  if (!parsedBody.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsedBody.error));

  const { ip, userAgent } = getRequestDetails(req);

  try {
    const rejected = await deps.appDb.$transaction(async (tx) => {
      const request = await tx.accessRequest.findUnique({ where: { id: parsedId.data.id } });
      if (!request) throw new Error("not_found");
      if (request.status !== "PENDING") throw new Error("invalid_transition");

      const updated = await tx.accessRequest.update({
        where: { id: request.id },
        data: {
          status: "REJECTED",
          reviewedAt: new Date(),
          reviewedById: actor.id,
          rejectionReason: parsedBody.data.rejectionReason?.trim() || null,
        },
      });

      const metadata = {
        actorUserId: actor.id,
        actorEmail: actor.email,
        requestId: request.id,
        targetUserId: request.userId,
        requestedRole: request.requestedRole,
        rejectionReason: updated.rejectionReason,
      } satisfies Prisma.InputJsonValue;

      await tx.adminAuditLog.create({
        data: {
          actorEmail: actor.email,
          action: "ACCESS_REQUEST_REJECTED",
          targetType: "access_request",
          targetId: request.id,
          metadata,
          ip,
          userAgent,
        },
      });

      return updated;
    });

    return NextResponse.json({ request: rejected });
  } catch (error) {
    if (error instanceof Error && error.message === "not_found") return apiError(404, "not_found", "Access request not found");
    if (error instanceof Error && error.message === "invalid_transition") return apiError(409, "invalid_transition", "Only pending requests can be rejected");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function handleListAccessRequests(req: NextRequest, deps: AccessRequestDeps = { appDb: db }) {
  const url = new URL(req.url);
  const statusQuery = url.searchParams.get("status");
  const status = statusQuery === null ? undefined : statusQuery.toUpperCase();
  if (status && !["PENDING", "APPROVED", "REJECTED"].includes(status)) {
    return apiError(400, "invalid_query", "Invalid status filter");
  }

  const requests = await deps.appDb.accessRequest.findMany({
    where: status ? { status: status as AccessRequestStatus } : undefined,
    orderBy: [{ createdAt: "desc" }],
    include: {
      user: { select: { id: true, email: true, role: true } },
      reviewedBy: { select: { id: true, email: true, role: true } },
    },
  });

  return NextResponse.json({ requests });
}
