import { NextRequest } from "next/server";
import { handleAdminIngestArtworkApprove } from "@/lib/admin-ingest-artwork-approve-route";

export { handleAdminIngestArtworkApprove } from "@/lib/admin-ingest-artwork-approve-route";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleAdminIngestArtworkApprove(context);
}
