import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireAuth();
  const artist = await db.artist.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  if (!artist) return Response.json({ inquiries: [] });

  const inquiries = await db.artworkInquiry.findMany({
    where: { artwork: { artistId: artist.id } },
    orderBy: [{ createdAt: "desc" }],
    take: 50,
    select: {
      id: true,
      artworkId: true,
      artwork: { select: { title: true, slug: true } },
      buyerName: true,
      buyerEmail: true,
      message: true,
      createdAt: true,
    },
  });

  return Response.json({ inquiries });
}
