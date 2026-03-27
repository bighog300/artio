import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as { artworkId1?: string; artworkId2?: string };

    if (!body.artworkId1 || !body.artworkId2) {
      return Response.json({ error: { message: "artworkId1 and artworkId2 are required" } }, { status: 400 });
    }

    const [artworkId1, artworkId2] = [body.artworkId1, body.artworkId2].sort((a, b) => a.localeCompare(b));

    await db.dismissedDuplicate.createMany({
      data: [{
        artworkId1,
        artworkId2,
        dismissedById: admin?.id ?? null,
      }],
      skipDuplicates: true,
    });

    return Response.json({ dismissed: true });
  } catch (error) {
    if (error instanceof Error && error.message === "forbidden") {
      return Response.json({ error: { message: "Forbidden" } }, { status: 403 });
    }
    return Response.json({ error: { message: "Unexpected server error" } }, { status: 500 });
  }
}
