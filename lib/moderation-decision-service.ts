import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { publishedStateAt } from "@/lib/publish-helpers";

type DbClient = Pick<typeof db, "$transaction">;

export type ModerationDecision = "APPROVE" | "REJECT";

type Actor = { id: string; email?: string | null; role?: string | null };

type DecideSubmissionInput = {
  submissionId: string;
  actor: Actor;
  decision: ModerationDecision;
  rejectionReason?: string;
};

export class ModerationDecisionError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}


export const allowedTransitions: Record<string, string[]> = {
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["PUBLISHED", "REJECTED"],
  PUBLISHED: ["APPROVED", "ARCHIVED"],
  REJECTED: ["IN_REVIEW"],
  ARCHIVED: ["APPROVED"],
};

export function validateModerationTransition(current: string, next: string) {
  const allowed = allowedTransitions[current] ?? [];
  if (!allowed.includes(next)) {
    throw new ModerationDecisionError(400, "invalid_transition", `Invalid transition from ${current} to ${next}`);
  }
}
export async function decideSubmission(input: DecideSubmissionInput, dbClient: DbClient = db) {
  return dbClient.$transaction(async (tx) => {
    const submission = await tx.submission.findUnique({
      where: { id: input.submissionId },
      include: {
        submitter: { select: { id: true, email: true } },
        targetVenue: { select: { id: true, slug: true } },
        targetEvent: { select: { id: true, slug: true } },
      },
    });

    if (!submission) throw new ModerationDecisionError(404, "not_found", "Submission not found");
    const isAdminActor = input.actor.role === "ADMIN";
    if (!isAdminActor && submission.submitterUserId === input.actor.id) throw new ModerationDecisionError(403, "forbidden", "Editors cannot decide their own submissions");

    if (input.actor.role && input.actor.role !== "EDITOR" && input.actor.role !== "ADMIN") {
      throw new ModerationDecisionError(403, "forbidden", "Editor role required");
    }

    if (submission.status !== "IN_REVIEW") {
      return { submission, idempotent: true as const, submitterId: submission.submitter.id, submitterEmail: submission.submitter.email };
    }

    const decidedAt = new Date();
    const isApprove = input.decision === "APPROVE";
    const decisionReason = isApprove ? null : (input.rejectionReason?.trim() || "Rejected by moderator");

    if (isApprove) {
      if (submission.type === "ARTIST" && submission.targetArtistId) {
        await tx.artist.update({
          where: { id: submission.targetArtistId },
          data: { isPublished: true, status: "PUBLISHED" },
        });
      }
      if (submission.type === "VENUE" && submission.targetVenueId) {
        await tx.venue.update({
          where: { id: submission.targetVenueId },
          data: { isPublished: true, status: "PUBLISHED" },
        });
      }
      if (submission.type === "EVENT" && submission.targetEventId) {
        await tx.event.update({ where: { id: submission.targetEventId }, data: { ...publishedStateAt(decidedAt) } });
      }
      if (submission.type === "ARTWORK" && submission.note?.startsWith("artworkId:")) {
        const artworkId = submission.note.replace("artworkId:", "").trim();
        await tx.artwork.update({
          where: { id: artworkId },
          data: { isPublished: true, status: "PUBLISHED" },
        });
      }
    }

    if (!isApprove && submission.type === "ARTWORK" && submission.note?.startsWith("artworkId:")) {
      const artworkId = submission.note.replace("artworkId:", "").trim();
      await tx.artwork.update({
        where: { id: artworkId },
        data: { status: "REJECTED" },
      });
    }

    const updated = await tx.submission.update({
      where: { id: submission.id },
      data: {
        status: isApprove ? "APPROVED" : "REJECTED",
        decidedByUserId: input.actor.id,
        decidedAt,
        decisionReason,
        rejectionReason: decisionReason,
      },
    });

    await tx.adminAuditLog.create({
      data: {
        actorEmail: input.actor.email ?? input.actor.id,
        action: isApprove ? "admin.submission.approve" : "admin.submission.reject",
        targetType: "submission",
        targetId: submission.id,
        metadata: {
          actorUserId: input.actor.id,
          submissionType: submission.type,
          decisionReason,
          entityPublished: isApprove,
        },
      },
    });

    const href = submission.type === "ARTIST"
      ? "/my/artist"
      : submission.type === "VENUE"
        ? `/my/venues/${submission.targetVenue?.id ?? submission.targetVenueId ?? submission.targetVenue?.slug ?? ""}`
        : `/my/events/${submission.targetEvent?.slug ?? submission.targetEventId ?? ""}`;

    await tx.notification.create({
      data: {
        userId: submission.submitterUserId,
        type: isApprove ? "SUBMISSION_APPROVED" : "SUBMISSION_REJECTED",
        title: isApprove ? `${submission.type} approved` : `${submission.type} needs edits`,
        body: isApprove ? "Your submission was approved and is now published." : decisionReason,
        href,
        dedupeKey: `moderation:${submission.id}:${isApprove ? "approved" : "rejected"}:${randomUUID()}`,
        entityType: submission.type,
        entityId: submission.targetArtistId ?? submission.targetVenueId ?? submission.targetEventId,
      },
    });

    return { submission: updated, idempotent: false as const, submitterId: submission.submitter.id, submitterEmail: submission.submitter.email };
  });
}
