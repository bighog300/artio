import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireAuth();
  const { id } = await params;

  const artist = await db.artist.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  if (!artist) {
    return Response.json(
      { error: "Artist not found" },
      { status: 404 },
    );
  }

  const inquiry = await db.artworkInquiry.findFirst({
    where: {
      id,
      artwork: { artistId: artist.id },
    },
    select: { id: true, readAt: true },
  });

  if (!inquiry) {
    return Response.json(
      { error: "Not found" },
      { status: 404 },
    );
  }

  const updated = await db.artworkInquiry.update({
    where: { id },
    data: { readAt: inquiry.readAt ? null : new Date() },
    select: { id: true, readAt: true },
  });

  return Response.json({ inquiry: updated });
}
