import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; tagId: string }> }) {
  try {
    await requireAdmin();
    const { id, tagId } = await params;

    await db.artworkTag.delete({
      where: {
        artworkId_tagId: {
          artworkId: id,
          tagId,
        },
      },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "P2025") {
      return Response.json({ ok: true, missing: true });
    }
    if (error instanceof Error && error.message === "forbidden") {
      return Response.json({ error: { message: "Forbidden" } }, { status: 403 });
    }
    return Response.json({ error: { message: "Unexpected server error" } }, { status: 500 });
  }
}
