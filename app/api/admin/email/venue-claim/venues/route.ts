import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (!q) return Response.json({ venues: [] });

    const venues = await db.venue.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take: 10,
      select: {
        id: true,
        name: true,
        city: true,
        contactEmail: true,
      },
    });

    const upcomingEventCounts = await Promise.all(
      venues.map((venue) =>
        db.event.count({
          where: { venueId: venue.id, startAt: { gte: new Date() } },
        }),
      ),
    );

    return Response.json({
      venues: venues.map((venue, index) => ({
        id: venue.id,
        name: venue.name,
        city: venue.city,
        contactEmail: venue.contactEmail,
        upcomingEventCount: upcomingEventCounts[index] ?? 0,
      })),
    });
  } catch {
    return apiError(403, "forbidden", "Admin role required");
  }
}
