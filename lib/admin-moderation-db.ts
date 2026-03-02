import { db } from "@/lib/db";
import { requireEditor } from "@/lib/auth";
import type { EntityType, ModerationDeps, QueueItem } from "@/lib/admin-moderation-route";
import { decideSubmission } from "@/lib/moderation-decision-service";

const publishKinds = [{ kind: "PUBLISH" as const }, { kind: null }];

function queueSort(items: QueueItem[]) {
  return items.sort((a, b) => new Date(b.submittedAtISO).getTime() - new Date(a.submittedAtISO).getTime());
}

export function createAdminModerationDeps(): ModerationDeps {
  return {
    requireAdminUser: async () => {
      const user = await requireEditor();
      return { id: user.id, email: user.email, role: user.role };
    },
    getQueueItems: async () => {
      const [artistSubmissions, venueSubmissions, eventSubmissions] = await Promise.all([
        db.submission.findMany({
          where: { type: "ARTIST", status: "IN_REVIEW", OR: publishKinds },
          include: { targetArtist: true, submitter: { select: { id: true, email: true, name: true } } },
        }),
        db.submission.findMany({
          where: { type: "VENUE", status: "IN_REVIEW", OR: publishKinds },
          include: { targetVenue: true, submitter: { select: { id: true, email: true, name: true } } },
        }),
        db.submission.findMany({
          where: { type: "EVENT", status: "IN_REVIEW", OR: publishKinds },
          include: { targetEvent: true, submitter: { select: { id: true, email: true, name: true } } },
        }),
      ]);

      const items: QueueItem[] = [
        ...artistSubmissions.filter((s) => s.submittedAt && s.targetArtistId && s.targetArtist).map((s) => ({
          entityType: "ARTIST" as const,
          submissionId: s.id,
          entityId: s.targetArtistId as string,
          title: s.targetArtist?.name ?? "Untitled artist",
          slug: s.targetArtist?.slug ?? null,
          submittedAtISO: s.submittedAt!.toISOString(),
          creator: s.submitter,
          summary: s.targetArtist?.bio ? "Bio added" : "Bio missing",
        })),
        ...venueSubmissions.filter((s) => s.submittedAt && s.targetVenueId && s.targetVenue).map((s) => ({
          entityType: "VENUE" as const,
          submissionId: s.id,
          entityId: s.targetVenueId as string,
          title: s.targetVenue?.name ?? "Untitled venue",
          slug: s.targetVenue?.slug ?? null,
          submittedAtISO: s.submittedAt!.toISOString(),
          creator: s.submitter,
          summary: [s.targetVenue?.city, s.targetVenue?.country].filter(Boolean).join(", ") || null,
        })),
        ...eventSubmissions.filter((s) => s.submittedAt && s.targetEventId && s.targetEvent).map((s) => ({
          entityType: "EVENT" as const,
          submissionId: s.id,
          entityId: s.targetEventId as string,
          title: s.targetEvent?.title ?? "Untitled event",
          slug: s.targetEvent?.slug ?? null,
          submittedAtISO: s.submittedAt!.toISOString(),
          creator: s.submitter,
          summary: s.targetEvent?.startAt?.toISOString() ?? null,
        })),
      ];
      return queueSort(items);
    },
    findSubmission: async (entityType: EntityType, submissionId: string) => db.submission.findFirst({
      where: { id: submissionId, type: entityType },
      select: { id: true, status: true, targetArtistId: true, targetVenueId: true, targetEventId: true },
    }),
    approveSubmission: async (_entityType: EntityType, submissionId: string, admin) => {
      await decideSubmission({
        submissionId,
        actor: { id: admin.id, email: admin.email, role: admin.role },
        decision: "APPROVE",
      });
    },
    rejectSubmission: async (_entityType: EntityType, submissionId: string, admin, rejectionReason: string) => {
      await decideSubmission({
        submissionId,
        actor: { id: admin.id, email: admin.email, role: admin.role },
        decision: "REJECT",
        rejectionReason,
      });
    },
  };
}
