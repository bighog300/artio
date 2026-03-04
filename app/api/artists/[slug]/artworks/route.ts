import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { getArtistArtworks } from "@/lib/artists";
import { slugParamSchema, zodDetails } from "@/lib/validators";

export const runtime = "nodejs";

const artistArtworksQuerySchema = z.object({
  tag: z.string().trim().min(1).max(80).optional(),
  forSale: z.enum(["true"]).optional(),
  sort: z.enum(["newest", "oldest", "az"]).optional(),
  limit: z.coerce.number().int().min(1).max(48).optional(),
  cursor: z.string().trim().min(1).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const parsedParams = slugParamSchema.safeParse(await params);
  if (!parsedParams.success) return apiError(400, "invalid_request", "Invalid route parameter", zodDetails(parsedParams.error));

  const parsedQuery = artistArtworksQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()));
  if (!parsedQuery.success) return apiError(400, "invalid_request", "Invalid query parameters", zodDetails(parsedQuery.error));

  const result = await getArtistArtworks(parsedParams.data.slug, {
    tag: parsedQuery.data.tag,
    forSale: parsedQuery.data.forSale === "true" ? true : undefined,
    sort: parsedQuery.data.sort,
    limit: parsedQuery.data.limit,
    cursor: parsedQuery.data.cursor,
  });

  return NextResponse.json(result);
}
