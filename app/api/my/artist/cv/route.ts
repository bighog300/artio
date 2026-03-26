import { NextRequest, NextResponse } from "next/server";
import { CvEntryType } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

const maxYear = new Date().getUTCFullYear() + 5;

const cvPayloadSchema = z.object({
  entryType: z.nativeEnum(CvEntryType),
  title: z.string().trim().min(1).max(300),
  organisation: z.string().trim().max(300).optional(),
  location: z.string().trim().max(300).optional(),
  year: z.number().int().min(1900).max(maxYear),
  endYear: z.number().int().min(1900).max(maxYear).optional(),
  description: z.string().trim().max(4000).optional(),
  url: z.string().trim().url().max(2000).optional(),
  sortOrder: z.number().int().optional(),
}).superRefine((value, ctx) => {
  if (value.endYear != null && value.endYear < value.year) {
    ctx.addIssue({ code: "custom", path: ["endYear"], message: "endYear must be greater than or equal to year" });
  }
});

const toNullable = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export async function GET() {
  try {
    const user = await requireAuth();
    const artist = await db.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: "not_found", message: "Artist profile not found" }, { status: 404 });

    const entries = await db.artistCvEntry.findMany({
      where: { artistId: artist.id },
      orderBy: [
        { entryType: "asc" },
        { year: "desc" },
        { sortOrder: "asc" },
        { createdAt: "asc" },
      ],
    });

    return NextResponse.json({ entries });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    return NextResponse.json({ error: "invalid_request", message: "Unexpected server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const artist = await db.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: "not_found", message: "Artist profile not found" }, { status: 404 });

    const parsed = cvPayloadSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_request", message: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const entry = await db.artistCvEntry.create({
      data: {
        artistId: artist.id,
        entryType: parsed.data.entryType,
        title: parsed.data.title,
        organisation: toNullable(parsed.data.organisation),
        location: toNullable(parsed.data.location),
        year: parsed.data.year,
        endYear: parsed.data.endYear ?? null,
        description: toNullable(parsed.data.description),
        url: toNullable(parsed.data.url),
        sortOrder: parsed.data.sortOrder ?? 0,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    return NextResponse.json({ error: "invalid_request", message: "Unexpected server error" }, { status: 500 });
  }
}
