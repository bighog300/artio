import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { adminModerationRejectSchema, zodDetails, parseBody } from "@/lib/validators";
import { ModerationDecisionError } from "@/lib/moderation-decision-service";

type EntityType = "ARTIST" | "VENUE" | "EVENT";

type ModeratorUser = { id: string; email: string | null; role: "EDITOR" | "ADMIN" };

type QueueItem = {
  entityType: EntityType;
  submissionId: string;
  entityId: string;
  title: string;
  slug: string | null;
  submittedAtISO: string;
  creator?: { id: string; email?: string | null; name?: string | null };
  summary?: string | null;
};

type ModerationSubmission = { id: string; status: "IN_REVIEW" | "APPROVED" | "REJECTED" | "DRAFT"; targetArtistId: string | null; targetVenueId: string | null; targetEventId: string | null };

type ModerationDeps = {
  requireAdminUser: () => Promise<ModeratorUser>;
  getQueueItems: () => Promise<QueueItem[]>;
  findSubmission: (entityType: EntityType, submissionId: string) => Promise<ModerationSubmission | null>;
  approveSubmission: (entityType: EntityType, submissionId: string, admin: ModeratorUser) => Promise<void>;
  rejectSubmission: (entityType: EntityType, submissionId: string, admin: ModeratorUser, rejectionReason: string) => Promise<void>;
};

function parseSubmissionId(params: { submissionId?: string }) {
  const raw = params.submissionId ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) return null;
  return raw;
}

export async function handleAdminModerationQueue(_req: NextRequest, deps: Pick<ModerationDeps, "requireAdminUser" | "getQueueItems">) {
  try {
    await deps.requireAdminUser();
  } catch (error) {
    return apiError(error instanceof Error && error.message === "unauthorized" ? 401 : 403, "forbidden", "Forbidden");
  }

  const items = await deps.getQueueItems();
  return NextResponse.json({ items });
}

async function resolvePending(entityType: EntityType, params: { submissionId?: string }, deps: Pick<ModerationDeps, "requireAdminUser" | "findSubmission">) {
  let admin: ModeratorUser;
  try {
    admin = await deps.requireAdminUser();
  } catch (error) {
    return { error: apiError(error instanceof Error && error.message === "unauthorized" ? 401 : 403, "forbidden", "Forbidden") };
  }

  const submissionId = parseSubmissionId(params);
  if (!submissionId) return { error: apiError(400, "invalid_request", "Invalid submissionId") };

  const submission = await deps.findSubmission(entityType, submissionId);
  if (!submission) return { error: apiError(404, "not_found", "Submission not found") };
  if (submission.status !== "IN_REVIEW") return { error: NextResponse.json({ error: "ALREADY_DECIDED" }, { status: 409 }) };

  return { admin, submissionId };
}

export async function handleAdminModerationApprove(entityType: EntityType, params: { submissionId?: string }, deps: Pick<ModerationDeps, "requireAdminUser" | "findSubmission" | "approveSubmission">) {
  const resolved = await resolvePending(entityType, params, deps);
  if ("error" in resolved) return resolved.error;

  try {
    await deps.approveSubmission(entityType, resolved.submissionId, resolved.admin);
  } catch (error) {
    if (error instanceof ModerationDecisionError) {
      return apiError(error.status, error.code, error.message);
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }

  return NextResponse.json({ ok: true });
}

export async function handleAdminModerationReject(req: NextRequest, entityType: EntityType, params: { submissionId?: string }, deps: Pick<ModerationDeps, "requireAdminUser" | "findSubmission" | "rejectSubmission">) {
  const parsed = adminModerationRejectSchema.safeParse(await parseBody(req));
  if (!parsed.success) return apiError(400, "invalid_request", "Invalid request body", zodDetails(parsed.error));

  const resolved = await resolvePending(entityType, params, deps);
  if ("error" in resolved) return resolved.error;

  try {
    await deps.rejectSubmission(entityType, resolved.submissionId, resolved.admin, parsed.data.rejectionReason);
  } catch (error) {
    if (error instanceof ModerationDecisionError) {
      return apiError(error.status, error.code, error.message);
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }

  return NextResponse.json({ ok: true });
}

export type { ModerationDeps, QueueItem, EntityType };
