import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { parseBody } from "@/lib/validators";

type SessionUser = { id: string };

type ArchivePayload = { reason?: string | null };

type EntityRecord = { id: string; deletedAt: Date | null; deletedReason: string | null; deletedByAdminId: string | null };

type Deps = {
  requireAuth: () => Promise<SessionUser>;
  getEntityForUser: (entityId: string, userId: string) => Promise<EntityRecord | null>;
  updateEntity: (entityId: string, data: Partial<EntityRecord>) => Promise<EntityRecord>;
};

function getReason(payload: unknown) {
  if (!payload || typeof payload !== "object") return "publisher_archive";
  const maybeReason = (payload as ArchivePayload).reason;
  if (typeof maybeReason !== "string") return "publisher_archive";
  const trimmed = maybeReason.trim();
  return trimmed.length > 0 ? trimmed : "publisher_archive";
}

export async function handleMyEntityArchive(req: NextRequest, params: { id: string }, deps: Deps) {
  try {
    const user = await deps.requireAuth();
    const current = await deps.getEntityForUser(params.id, user.id);
    if (!current) return apiError(403, "forbidden", "Forbidden");
    if (current.deletedAt) return NextResponse.json({ item: current });

    const payload = await parseBody(req).catch(() => ({}));
    const item = await deps.updateEntity(params.id, {
      deletedAt: new Date(),
      deletedReason: getReason(payload),
      deletedByAdminId: null,
    });
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function handleMyEntityRestore(params: { id: string }, deps: Deps) {
  try {
    const user = await deps.requireAuth();
    const current = await deps.getEntityForUser(params.id, user.id);
    if (!current) return apiError(403, "forbidden", "Forbidden");
    if (!current.deletedAt) return NextResponse.json({ item: current });

    const item = await deps.updateEntity(params.id, {
      deletedAt: null,
      deletedReason: null,
      deletedByAdminId: null,
    });
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
