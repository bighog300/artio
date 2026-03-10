import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category");
  const items = await db.tag.findMany({
    where: category ? { category } : undefined,
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ items });
}
