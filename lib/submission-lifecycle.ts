export type LifecycleStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED";

export type SubmissionLifecycleSummary = {
  submissionId: string;
  status: LifecycleStatus;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
};

type MinimalSubmission = {
  id: string;
  status: LifecycleStatus;
  submittedAt: Date | null;
  decidedAt: Date | null;
  decisionReason: string | null;
  rejectionReason: string | null;
};

type LifecycleDb = {
  submission: {
    findFirst: (args: {
      where: Record<string, unknown>;
      orderBy: Array<Record<string, "asc" | "desc">>;
      select: { id: true; status: true; submittedAt: true; decidedAt: true; decisionReason: true; rejectionReason: true };
    }) => Promise<MinimalSubmission | null>;
  };
};

function toSummary(row: MinimalSubmission | null): SubmissionLifecycleSummary | null {
  if (!row) return null;
  return {
    submissionId: row.id,
    status: row.status,
    submittedAt: row.submittedAt,
    reviewedAt: row.decidedAt,
    rejectionReason: row.rejectionReason ?? row.decisionReason,
  };
}

async function getLatest(db: LifecycleDb, where: Record<string, unknown>) {
  return toSummary(await db.submission.findFirst({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, status: true, submittedAt: true, decidedAt: true, decisionReason: true, rejectionReason: true },
  }));
}

export function getStatusUiLabel(status: LifecycleStatus | null) {
  if (status === "IN_REVIEW") return "Submitted";
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Needs edits";
  return "Draft";
}

export async function getLatestArtistSubmission(db: LifecycleDb, artistId: string) {
  return getLatest(db, { targetArtistId: artistId, type: "ARTIST", kind: "PUBLISH" });
}

export async function getLatestVenueSubmission(db: LifecycleDb, venueId: string) {
  return getLatest(db, { targetVenueId: venueId, type: "VENUE", kind: "PUBLISH" });
}

export async function getLatestEventSubmission(db: LifecycleDb, eventId: string) {
  return getLatest(db, { targetEventId: eventId, type: "EVENT", OR: [{ kind: "PUBLISH" }, { kind: null }] });
}
