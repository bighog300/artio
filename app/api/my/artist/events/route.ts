import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { normalizeAssociationRole } from "@/lib/association-roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  eventId: z.string().uuid(),
  role: z.unknown().optional(),
  message: z.string().trim().max(500).optional(),
});

export async function GET() {
  try {
    const user = await requireAuth();
    const artist = await db.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: "forbidden", message: "Artist profile required" }, { status: 403 });

    const rows = await db.artistEventAssociation.findMany({
      where: { artistId: artist.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        role: true,
        message: true,
        createdAt: true,
        updatedAt: true,
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            startAt: true,
            venue: { select: { name: true } },
          },
        },
      },
    });

    const associations = rows.map((row) => ({
      id: row.id,
      status: row.status as "PENDING" | "APPROVED" | "REJECTED",
      role: row.role,
      message: row.message,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      event: {
        id: row.event.id,
        title: row.event.title,
        slug: row.event.slug,
        startAt: row.event.startAt,
        venueName: row.event.venue?.name ?? null,
      },
    }));

    return NextResponse.json({
      pending: associations.filter((row) => row.status === "PENDING"),
      approved: associations.filter((row) => row.status === "APPROVED"),
      rejected: associations.filter((row) => row.status === "REJECTED"),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return NextResponse.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    return NextResponse.json({ error: "invalid_request", message: "Unexpected server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const artist = await db.artist.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!artist) return NextResponse.json({ error: "forbidden", message: "Artist profile required" }, { status: 403 });

    const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "invalid_request", message: "Invalid payload" }, { status: 400 });

    const event = await db.event.findFirst({ where: { id: parsed.data.eventId, isPublished: true }, select: { id: true } });
    if (!event) return NextResponse.json({ error: "invalid_request", message: "Event not found or unpublished" }, { status: 400 });

    const existing = await db.artistEventAssociation.findUnique({
      where: { artistId_eventId: { artistId: artist.id, eventId: parsed.data.eventId } },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ error: "conflict", message: "Association already exists" }, { status: 409 });

    const association = await db.artistEventAssociation.create({
      data: {
        artistId: artist.id,
        eventId: parsed.data.eventId,
        status: "PENDING",
        role: normalizeAssociationRole(parsed.data.role),
        message: parsed.data.message ?? null,
        requestedByUserId: user.id,
      },
      select: {
        id: true,
        artistId: true,
        eventId: true,
        status: true,
        role: true,
        message: true,
        createdAt: true,
        updatedAt: true,
        requestedByUserId: true,
      },
    });

    return NextResponse.json(association, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return NextResponse.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    return NextResponse.json({ error: "invalid_request", message: "Unexpected server error" }, { status: 500 });
  }
}
