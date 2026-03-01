import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth, isAuthError } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { ensureUniqueEventSlugWithDeps, slugifyEventTitle } from "@/lib/event-slug";

export const runtime = "nodejs";

const bodySchema = z.object({
  title: z.string().trim().min(2).max(120),
  venueId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return apiError(400, "invalid_request", "Title is required");

    const memberships = await db.venueMembership.findMany({
      where: { userId: user.id, role: { in: ["OWNER", "EDITOR"] } },
      select: { venueId: true },
    });
    const managedVenueIds = new Set(memberships.map((membership) => membership.venueId));

    let venueId: string | null = parsed.data.venueId ?? null;
    if (venueId && !managedVenueIds.has(venueId)) return apiError(403, "forbidden", "Venue membership required");
    if (!venueId && memberships.length === 1) venueId = memberships[0]!.venueId;

    const slug = await ensureUniqueEventSlugWithDeps(
      { findBySlug: (candidate) => db.event.findUnique({ where: { slug: candidate }, select: { id: true } }) },
      slugifyEventTitle(parsed.data.title),
    );

    const event = await db.event.create({
      data: {
        title: parsed.data.title,
        slug,
        startAt: new Date(),
        timezone: "UTC",
        venueId,
        status: "DRAFT",
        isPublished: false,
      },
      select: { id: true },
    });

    return NextResponse.json({ eventId: event.id });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
