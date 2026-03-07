import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { publishedEventWhere } from "@/lib/publish-status";
import { handleGetRegistrationAvailability } from "@/lib/registration-availability-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return handleGetRegistrationAvailability(req, slug, {
    findPublishedEventBySlug: async (eventSlug) => db.event.findFirst({
      where: { slug: eventSlug, deletedAt: null, ...publishedEventWhere() },
      select: { id: true, capacity: true, rsvpClosesAt: true },
    }),
    prisma: db,
    now: () => new Date(),
  });
}
