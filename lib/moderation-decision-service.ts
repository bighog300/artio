import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

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
    if (submission.submitterUserId === input.actor.id) throw new ModerationDecisionError(403, "forbidden", "Moderators cannot decide their own submissions");

    if (input.actor.role && input.actor.role !== "EDITOR" && input.actor.role !== "ADMIN") {
      throw new ModerationDecisionError(403, "forbidden", "Editor role required");
    }

    if (submission.status !== "SUBMITTED") {
      return { submission, idempotent: true as const, submitterId: submission.submitter.id, submitterEmail: submission.submitter.email };
    }

    const decidedAt = new Date();
    const isApprove = input.decision === "APPROVE";
    const decisionReason = isApprove ? null : (input.rejectionReason?.trim() || "Rejected by moderator");

    if (isApprove) {
      if (submission.type === "ARTIST" && submission.targetArtistId) {
        await tx.artist.update({ where: { id: submission.targetArtistId }, data: { isPublished: true } });
      }
      if (submission.type === "VENUE" && submission.targetVenueId) {
        await tx.venue.update({ where: { id: submission.targetVenueId }, data: { isPublished: true } });
      }
      if (submission.type === "EVENT" && submission.targetEventId) {
        await tx.event.update({ where: { id: submission.targetEventId }, data: { isPublished: true, publishedAt: decidedAt } });
      }
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
