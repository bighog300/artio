import { NextRequest, NextResponse } from "next/server";
import { CvEntryType } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

const maxYear = new Date().getUTCFullYear() + 5;

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const cvUpdateSchema = z.object({
  entryType: z.nativeEnum(CvEntryType).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  organisation: z.string().trim().max(300).optional(),
  location: z.string().trim().max(300).optional(),
  year: z.number().int().min(1900).max(maxYear).optional(),
  endYear: z.number().int().min(1900).max(maxYear).nullable().optional(),
  description: z.string().trim().max(4000).optional(),
  url: z.string().trim().url().max(2000).optional(),
  sortOrder: z.number().int().optional(),
}).superRefine((value, ctx) => {
  if (Object.keys(value).length === 0) {
    ctx.addIssue({ code: "custom", message: "At least one field is required" });
    return;
  }

  if (value.endYear != null && value.year != null && value.endYear < value.year) {
    ctx.addIssue({ code: "custom", path: ["endYear"], message: "endYear must be greater than or equal to year" });
  }
});

const toNullable = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const artist = await db.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: "not_found", message: "Artist profile not found" }, { status: 404 });

    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "invalid_request", message: "Invalid route parameter" }, { status: 400 });
    }

    const existing = await db.artistCvEntry.findUnique({
      where: { id: parsedParams.data.id },
      select: { id: true, artistId: true, year: true },
    });

    if (!existing) return NextResponse.json({ error: "not_found", message: "CV entry not found" }, { status: 404 });
    if (existing.artistId !== artist.id) return NextResponse.json({ error: "forbidden", message: "CV entry not owned by artist" }, { status: 403 });

    const parsedBody = cvUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsedBody.success) {
      return NextResponse.json({ error: "invalid_request", message: "Invalid payload", details: parsedBody.error.flatten() }, { status: 400 });
    }

    const nextYear = parsedBody.data.year ?? existing.year;
    if (parsedBody.data.endYear != null && parsedBody.data.endYear < nextYear) {
      return NextResponse.json({ error: "invalid_request", message: "endYear must be greater than or equal to year" }, { status: 400 });
    }

    const entry = await db.artistCvEntry.update({
      where: { id: existing.id },
      data: {
        entryType: parsedBody.data.entryType,
        title: parsedBody.data.title,
        organisation: parsedBody.data.organisation === undefined ? undefined : toNullable(parsedBody.data.organisation),
        location: parsedBody.data.location === undefined ? undefined : toNullable(parsedBody.data.location),
        year: parsedBody.data.year,
        endYear: parsedBody.data.endYear,
        description: parsedBody.data.description === undefined ? undefined : toNullable(parsedBody.data.description),
        url: parsedBody.data.url === undefined ? undefined : toNullable(parsedBody.data.url),
        sortOrder: parsedBody.data.sortOrder,
      },
    });

    return NextResponse.json(entry);
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    return NextResponse.json({ error: "invalid_request", message: "Unexpected server error" }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const artist = await db.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: "not_found", message: "Artist profile not found" }, { status: 404 });

    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "invalid_request", message: "Invalid route parameter" }, { status: 400 });
    }

    const existing = await db.artistCvEntry.findUnique({
      where: { id: parsedParams.data.id },
      select: { id: true, artistId: true },
    });

    if (!existing) return NextResponse.json({ error: "not_found", message: "CV entry not found" }, { status: 404 });
    if (existing.artistId !== artist.id) return NextResponse.json({ error: "forbidden", message: "CV entry not owned by artist" }, { status: 403 });

    await db.artistCvEntry.delete({ where: { id: existing.id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    return NextResponse.json({ error: "invalid_request", message: "Unexpected server error" }, { status: 500 });
  }
}
