import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { guardUser } from "@/lib/auth-guard";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await guardUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  const collection = await db.collection.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!collection) return apiError(404, "not_found", "Collection not found");

  const body = await req.json().catch(() => null) as { entityType?: "EVENT" | "ARTIST" | "VENUE" | "ARTWORK"; entityId?: string } | null;
  if (!body?.entityType || !body.entityId) return apiError(400, "invalid_request", "entityType and entityId are required");

  const item = await db.collectionItem.upsert({
    where: { collectionId_entityType_entityId: { collectionId: id, entityType: body.entityType, entityId: body.entityId } },
    update: {},
    create: { collectionId: id, entityType: body.entityType, entityId: body.entityId },
    select: { id: true },
  });
  return NextResponse.json(item, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await guardUser();
  if (user instanceof NextResponse) return user;
  const { id } = await params;

  const collection = await db.collection.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!collection) return apiError(404, "not_found", "Collection not found");

  const body = await req.json().catch(() => null) as { entityType?: "EVENT" | "ARTIST" | "VENUE" | "ARTWORK"; entityId?: string } | null;
  if (!body?.entityType || !body.entityId) return apiError(400, "invalid_request", "entityType and entityId are required");

  await db.collectionItem.deleteMany({ where: { collectionId: id, entityType: body.entityType, entityId: body.entityId } });
  return NextResponse.json({ ok: true });
}
