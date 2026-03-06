import test from "node:test";
import assert from "node:assert/strict";
import type { NotificationOutbox, NotificationType } from "@prisma/client";
import { sendPendingNotificationsWithDb } from "../lib/outbox-worker.ts";

type OutboxStatus = NotificationOutbox["status"];

function createMemoryDb(seed: NotificationOutbox[]) {
  const rows = new Map(seed.map((row) => [row.id, { ...row }]));

  return {
    rows,
    db: {
      emailUnsubscribe: {
        async findUnique() {
          return null;
        },
      },
      notificationOutbox: {
        async findMany(args: {
          where: {
            status: "PENDING";
            OR: Array<{ nextRetryAt: null } | { nextRetryAt: { lte: Date } }>;
          };
          orderBy: { createdAt: "asc" };
          take: number;
        }) {
          const now = args.where.OR.find((entry): entry is { nextRetryAt: { lte: Date } } => "nextRetryAt" in entry && entry.nextRetryAt !== null)?.nextRetryAt.lte;

          return [...rows.values()]
            .filter((row) => row.status === args.where.status)
            .filter((row) => row.nextRetryAt === null || (now ? row.nextRetryAt <= now : false))
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .slice(0, args.take)
            .map((row) => ({
              id: row.id,
              type: row.type,
              toEmail: row.toEmail,
              payload: row.payload as Record<string, unknown>,
              dedupeKey: row.dedupeKey,
              attemptCount: row.attemptCount,
            }));
        },
        async updateMany(args: {
          where:
            | { id: string; status: "PENDING" | "PROCESSING"; errorMessage?: string | null }
            | { status: "PROCESSING"; createdAt: { lte: Date } };
          data: {
            status?: OutboxStatus;
            sentAt?: Date | null;
            errorMessage?: string | null;
            attemptCount?: number;
            nextRetryAt?: Date | null;
          };
        }) {
          if ("id" in args.where) {
            const row = rows.get(args.where.id);
            if (!row || row.status !== args.where.status) {
              return { count: 0 };
            }

            if (Object.prototype.hasOwnProperty.call(args.where, "errorMessage") && row.errorMessage !== args.where.errorMessage) {
              return { count: 0 };
            }

            if (args.data.status) {
              row.status = args.data.status;
            }
            if (Object.prototype.hasOwnProperty.call(args.data, "sentAt")) {
              row.sentAt = args.data.sentAt ?? null;
            }
            if (Object.prototype.hasOwnProperty.call(args.data, "errorMessage")) {
              row.errorMessage = args.data.errorMessage ?? null;
            }
            if (typeof args.data.attemptCount === "number") {
              row.attemptCount = args.data.attemptCount;
            }
            if (Object.prototype.hasOwnProperty.call(args.data, "nextRetryAt")) {
              row.nextRetryAt = args.data.nextRetryAt ?? null;
            }
            rows.set(row.id, row);
            return { count: 1 };
          }

          let count = 0;
          for (const row of rows.values()) {
            if (row.status !== args.where.status) continue;
            if (row.createdAt > args.where.createdAt.lte) continue;
            if (args.data.status) {
              row.status = args.data.status;
            }
            if (Object.prototype.hasOwnProperty.call(args.data, "errorMessage")) {
              row.errorMessage = args.data.errorMessage ?? null;
            }
            if (Object.prototype.hasOwnProperty.call(args.data, "nextRetryAt")) {
              row.nextRetryAt = args.data.nextRetryAt ?? null;
            }
            count += 1;
          }

          return { count };
        },
      },
    },
  };
}

function makeOutboxRow(id: string, status: OutboxStatus, createdAt: string): NotificationOutbox {
  return {
    id,
    type: "SUBMISSION_APPROVED" satisfies NotificationType,
    toEmail: "person@example.com",
    payload: { type: "SUBMISSION_APPROVED", submissionId: id },
    dedupeKey: `dedupe-${id}`,
    status,
    createdAt: new Date(createdAt),
    sentAt: null,
    errorMessage: null,
    attemptCount: 0,
    nextRetryAt: null,
  };
}

test("outbox worker records retry backoff when delivery fails", async () => {
  const { db, rows } = createMemoryDb([
    makeOutboxRow("oldest-pending", "PENDING", "2026-01-01T00:00:00.000Z"),
    makeOutboxRow("already-sent", "SENT", "2026-01-01T00:01:00.000Z"),
    makeOutboxRow("newer-pending", "PENDING", "2026-01-01T00:02:00.000Z"),
  ]);

  const firstRun = await sendPendingNotificationsWithDb({ limit: 25 }, db);
  assert.deepEqual(firstRun, { sent: 0, failed: 2, skipped: 0 });
  assert.equal(rows.get("oldest-pending")?.status, "PENDING");
  assert.equal(rows.get("newer-pending")?.status, "PENDING");
  assert.equal(rows.get("oldest-pending")?.attemptCount, 1);
  assert.equal(rows.get("newer-pending")?.attemptCount, 1);
  assert.equal(rows.get("already-sent")?.status, "SENT");

  const secondRun = await sendPendingNotificationsWithDb({ limit: 25 }, db);
  assert.deepEqual(secondRun, { sent: 0, failed: 0, skipped: 0 });
});
