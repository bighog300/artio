import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { fetchHtmlWithGuards } from "@/lib/ingest/fetch-html";
import { classifyPageImages } from "@/lib/ingest/classify-image";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({ url: z.string().url() });

export async function POST(req: NextRequest) {
  noStore();

  try {
    await requireAdmin();

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return apiError(400, "invalid_request", "Invalid URL");
    }

    const fetched = await fetchHtmlWithGuards(parsed.data.url);
    const images = classifyPageImages(fetched.html, fetched.finalUrl);

    const sorted = images
      .filter((img) => img.imageType !== "unknown")
      .sort((a, b) => {
        const typeOrder: Record<string, number> = { profile: 0, artwork: 1, poster: 2, venue: 3, unknown: 4 };
        const typeDiff = (typeOrder[a.imageType] ?? 4) - (typeOrder[b.imageType] ?? 4);
        return typeDiff !== 0 ? typeDiff : b.confidence - a.confidence;
      })
      .slice(0, 30);

    return NextResponse.json(
      { url: fetched.finalUrl, images: sorted },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (isAuthError(error)) {
      return apiError(401, "unauthorized", "Authentication required");
    }
    if (error instanceof Error && error.message === "forbidden") {
      return apiError(403, "forbidden", "Forbidden");
    }
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
