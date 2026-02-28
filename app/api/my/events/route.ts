import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { setOnboardingFlagForSession } from "@/lib/onboarding";
import { logAdminAction } from "@/lib/admin-audit";
import { handlePostMyEvent } from "@/lib/my-event-create-route";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return handlePostMyEvent(req, {
    requireAuth,
    listManagedVenues: async (userId) => db.venueMembership.findMany({
      where: { userId, role: { in: ["OWNER", "EDITOR"] } },
      select: { venueId: true, role: true },
    }).then((rows) => rows.map((row) => ({ id: row.venueId, role: row.role }))),
    findExistingDraftByCreateKey: async ({ userId, createKey, startAt, venueId }) => {
      const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      const events = await db.event.findMany({
        where: {
          isPublished: false,
          deletedAt: null,
          startAt,
          venueId,
          submissions: {
            some: {
              submitterUserId: userId,
              type: "EVENT",
              OR: [{ kind: "PUBLISH" }, { kind: null }],
            },
          },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, slug: true, title: true, startAt: true, endAt: true, venueId: true, isPublished: true },
      });

      return events.find((event) => [normalize(event.title), event.startAt.toISOString(), event.venueId ?? "none"].join("|") === createKey) ?? null;
    },
    findEventBySlug: async (slug) => db.event.findUnique({ where: { slug }, select: { id: true } }),
    createEvent: async (input) => db.event.create({
      data: {
        title: input.title,
        slug: input.slug,
        startAt: input.startAt,
        endAt: input.endAt,
        venueId: input.venueId,
        ticketUrl: input.ticketUrl,
        timezone: input.timezone,
        eventType: input.eventType,
        isPublished: false,
          deletedAt: null,
        publishedAt: null,
      },
      select: { id: true, slug: true, title: true, startAt: true, endAt: true, venueId: true, isPublished: true },
    }),
    upsertEventDraftSubmission: async (eventId, userId, venueId) => {
      const current = await db.submission.findFirst({
        where: { targetEventId: eventId, OR: [{ kind: "PUBLISH" }, { kind: null }] },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true },
      });

      if (current) {
        await db.submission.update({
          where: { id: current.id },
          data: {
            status: current.status === "APPROVED" ? current.status : "DRAFT",
            submitterUserId: userId,
            venueId,
            type: "EVENT",
            kind: "PUBLISH",
            decidedAt: current.status === "APPROVED" ? undefined : null,
            decidedByUserId: current.status === "APPROVED" ? undefined : null,
            decisionReason: current.status === "APPROVED" ? undefined : null,
            submittedAt: null,
          },
        });
        return;
      }

      await db.submission.create({
        data: {
          type: "EVENT",
          kind: "PUBLISH",
          status: "DRAFT",
          submitterUserId: userId,
          venueId,
          targetEventId: eventId,
        },
      });
    },
    setOnboardingFlag: async (user) => {
      await setOnboardingFlagForSession(user, "hasSubmittedEvent", true, { path: "/api/my/events" });
    },
    logAudit: async ({ action, user, event, reused, createKey, req: request, missingVenue }) => {
      await logAdminAction({
        actorEmail: user.email ?? "unknown@local",
        action,
        targetType: "event",
        targetId: event.id,
        metadata: {
          userId: user.id,
          eventId: event.id,
          venueId: event.venueId,
          startAt: event.startAt.toISOString(),
          reused,
          createKey,
          missingVenue,
        },
        req: request,
      });
    },
  });
}
