import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { tagId?: string };

    if (!body.tagId) {
      return Response.json({ error: { message: "tagId is required" } }, { status: 400 });
    }

    const created = await db.artworkTag.create({
      data: {
        artworkId: id,
        tagId: body.tagId,
      },
      select: {
        artworkId: true,
        tag: {
          select: { id: true, name: true, slug: true, category: true },
        },
      },
    });

    return Response.json({ ok: true, tag: created.tag });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "P2002") {
      return Response.json({ ok: true, duplicate: true });
    }
    if (code === "P2003" || code === "P2025") {
      return Response.json({ error: { message: "Artwork or tag not found" } }, { status: 404 });
    }
    if (error instanceof Error && error.message === "forbidden") {
      return Response.json({ error: { message: "Forbidden" } }, { status: 403 });
    }
    return Response.json({ error: { message: "Unexpected server error" } }, { status: 500 });
  }
}
