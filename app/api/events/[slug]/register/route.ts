import { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { publishedEventWhere } from "@/lib/publish-status";
import { enforceRateLimit } from "@/lib/rate-limit";
import { handlePostRegistrationCreate } from "@/lib/registration-create-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function nanoid(size = 21) {
  let out = "";
  for (let i = 0; i < size; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)] ?? "A";
  }
  return out;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return handlePostRegistrationCreate(req, slug, {
    getSessionUser,
    findPublishedEventBySlug: async (eventSlug) => db.event.findFirst({
      where: { slug: eventSlug, deletedAt: null, ...publishedEventWhere() },
      select: { id: true, ticketingMode: true, capacity: true, rsvpClosesAt: true },
    }),
    prisma: db,
    enforceRateLimit,
    now: () => new Date(),
    generateConfirmationCode: () => `AP-${nanoid(6).toUpperCase()}`,
  });
}
