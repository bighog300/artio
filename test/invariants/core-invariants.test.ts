import test from "node:test";
import assert from "node:assert/strict";
import { decodeNearbyCursor, encodeNearbyCursor } from "../../lib/nearby-cursor";
import { START_AT_ID_ORDER_BY } from "../../lib/cursor-predicate";
import { decodeSubmissionsCursor, encodeSubmissionsCursor } from "../../lib/admin-submissions-cursor";
import { decideSubmission, ModerationDecisionError } from "../../lib/moderation-decision-service";
import { markNotificationsReadWithDb } from "../../lib/notification-inbox";
import { scopedReadBatchIds } from "../../lib/notifications-read-batch";

function makeModerationDbState() {
  return {
    submission: {
      id: "sub-1",
      type: "VENUE" as const,
      status: "IN_REVIEW" as const,
      submitterUserId: "user-1",
      targetArtistId: null,
      targetVenueId: "venue-1",
      targetEventId: null,
      submitter: { id: "user-1", email: "submitter@example.com" },
      targetVenue: { slug: "venue-one" },
      targetEvent: null,
      decidedAt: null,
      decidedByUserId: null,
      decisionReason: null,
      rejectionReason: null,
    },
    venuePublished: false,
    audits: [] as Array<{ action: string }>,
    notifications: [] as Array<{ userId: string }> ,
  };
}

function makeDbHarness(state: ReturnType<typeof makeModerationDbState>, opts?: { failNotification?: boolean }) {
  return {
    $transaction: async (fn: (tx: any) => Promise<unknown>) => {
      const snapshot = structuredClone(state);
      const tx = {
        submission: {
          findUnique: async () => state.submission,
          update: async ({ data }: { data: Record<string, unknown> }) => {
            state.submission = { ...state.submission, ...data } as typeof state.submission;
            return state.submission;
          },
        },
        venue: {
          update: async () => { state.venuePublished = true; },
        },
        artist: { update: async () => undefined },
        event: { update: async () => undefined },
        adminAuditLog: {
          create: async ({ data }: { data: { action: string } }) => { state.audits.push({ action: data.action }); },
        },
        notification: {
          create: async ({ data }: { data: { userId: string } }) => {
            if (opts?.failNotification) throw new Error("notification down");
            state.notifications.push({ userId: data.userId });
          },
        },
      };
      try {
        return await fn(tx);
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    },
  };
}

test("nearby cursor roundtrips via base64url encoding", () => {
  const payload = { id: "evt_123", startAt: new Date("2026-03-01T12:00:00.000Z") };

  const encoded = encodeNearbyCursor(payload);
  const decoded = decodeNearbyCursor(encoded);

  assert.deepEqual(decoded, payload);
});

test("nearby cursor decode returns null for invalid payload", () => {
  assert.equal(decodeNearbyCursor("not-a-valid-cursor"), null);
});

test("startAt/id ordering keeps id as deterministic tie-breaker", () => {
  assert.deepEqual(START_AT_ID_ORDER_BY, [{ startAt: "asc" }, { id: "asc" }]);
});

test("moderation approval is atomic: no partial writes on failure", async () => {
  const state = makeModerationDbState();
  const dbHarness = makeDbHarness(state, { failNotification: true });

  await assert.rejects(
    decideSubmission({ submissionId: state.submission.id, actor: { id: "editor-1", role: "EDITOR" }, decision: "APPROVE" }, dbHarness as never),
    /notification down/,
  );

  assert.equal(state.submission.status, "IN_REVIEW");
  assert.equal(state.venuePublished, false);
  assert.deepEqual(state.audits, []);
  assert.deepEqual(state.notifications, []);
});

test("editors cannot approve their own submissions", async () => {
  const state = makeModerationDbState();
  const dbHarness = makeDbHarness(state);

  await assert.rejects(
    decideSubmission({ submissionId: state.submission.id, actor: { id: "user-1", role: "EDITOR" }, decision: "APPROVE" }, dbHarness as never),
    (error: unknown) => error instanceof ModerationDecisionError
      && error.status === 403
      && error.code === "forbidden"
      && error.message === "Editors cannot decide their own submissions",
  );

  assert.equal(state.submission.status, "IN_REVIEW");
  assert.equal(state.venuePublished, false);
  assert.deepEqual(state.audits, []);
  assert.deepEqual(state.notifications, []);
});

test("admins can approve their own submissions", async () => {
  const state = makeModerationDbState();
  const dbHarness = makeDbHarness(state);

  const result = await decideSubmission({ submissionId: state.submission.id, actor: { id: "user-1", role: "ADMIN" }, decision: "APPROVE" }, dbHarness as never);

  assert.equal(result.idempotent, false);
  assert.equal(state.submission.status, "APPROVED");
  assert.equal(state.submission.decidedByUserId, "user-1");
  assert.equal(state.venuePublished, true);
  assert.equal(state.audits.length, 1);
  assert.equal(state.notifications.length, 1);
});

test("admin submissions pagination: no duplicates/skips across cursor pages under mixed submittedAt", () => {
  const seeded = [
    { id: "s9", submittedAt: new Date("2026-01-03T00:00:00.000Z") },
    { id: "s8", submittedAt: new Date("2026-01-03T00:00:00.000Z") },
    { id: "s7", submittedAt: new Date("2026-01-02T00:00:00.000Z") },
    { id: "s6", submittedAt: new Date("2026-01-02T00:00:00.000Z") },
    { id: "s5", submittedAt: new Date("2026-01-01T00:00:00.000Z") },
  ];

  const ordered = [...seeded].sort((a, b) => {
    const t = b.submittedAt.getTime() - a.submittedAt.getTime();
    return t !== 0 ? t : b.id.localeCompare(a.id);
  });

  const pageSize = 2;
  const page1 = ordered.slice(0, pageSize);
  const cursor1 = encodeSubmissionsCursor({ id: page1[page1.length - 1]!.id, submittedAtISO: page1[page1.length - 1]!.submittedAt.toISOString() });
  const decoded1 = decodeSubmissionsCursor(cursor1);
  assert.ok(decoded1);

  const page2 = ordered
    .filter((item) => item.submittedAt.getTime() < new Date(decoded1!.submittedAtISO).getTime()
      || (item.submittedAt.getTime() === new Date(decoded1!.submittedAtISO).getTime() && item.id < decoded1!.id))
    .slice(0, pageSize);

  const combined = [...page1, ...page2].map((item) => item.id);
  assert.equal(new Set(combined).size, combined.length);
  assert.deepEqual(combined, ordered.slice(0, combined.length).map((item) => item.id));
});

test("notification read-batch sets readAt consistently", async () => {
  const notifications = [
    { id: "n1", userId: "user-1", status: "UNREAD" as const, readAt: null as Date | null },
    { id: "n2", userId: "user-1", status: "UNREAD" as const, readAt: null as Date | null },
    { id: "n3", userId: "user-2", status: "UNREAD" as const, readAt: null as Date | null },
  ];

  const inboxDb = {
    notification: {
      findMany: async ({ where }: { where: { userId: string; id: { in: string[] } } }) => notifications
        .filter((notification) => notification.userId === where.userId && where.id.in.includes(notification.id))
        .map((notification) => ({ id: notification.id })),
      updateMany: async ({ where, data }: { where: { userId: string; id: { in: string[] }; readAt: null }; data: { status: "READ"; readAt: Date } }) => {
        let count = 0;
        for (const notification of notifications) {
          if (notification.userId !== where.userId) continue;
          if (!where.id.in.includes(notification.id)) continue;
          if (notification.readAt !== null) continue;
          notification.status = data.status;
          notification.readAt = data.readAt;
          count += 1;
        }
        return { count };
      },
    },
  };

  const requestedIds = ["n1", "n2", "n3"];
  const owned = await inboxDb.notification.findMany({ where: { userId: "user-1", id: { in: requestedIds } } });
  const ids = scopedReadBatchIds(requestedIds, owned.map((item) => item.id));

  const updatedCount = await markNotificationsReadWithDb(inboxDb as never, { userId: "user-1", notificationIds: ids });
  assert.equal(updatedCount, 2);

  assert.equal(notifications[0]?.status, "READ");
  assert.ok(notifications[0]?.readAt);
  assert.equal(notifications[1]?.status, "READ");
  assert.ok(notifications[1]?.readAt);
  assert.equal(notifications[2]?.status, "UNREAD");
  assert.equal(notifications[2]?.readAt, null);

  const firstReadAt = notifications[0]?.readAt;
  const updatedAgain = await markNotificationsReadWithDb(inboxDb as never, { userId: "user-1", notificationIds: ["n1"] });
  assert.equal(updatedAgain, 0);
  assert.equal(notifications[0]?.readAt, firstReadAt);
});
