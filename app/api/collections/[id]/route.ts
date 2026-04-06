import { NextRequest } from "next/server";
import { handlePublicCollectionBySlug } from "@/lib/public-collections-route";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePublicCollectionBySlug(req, { slug: id });
}
