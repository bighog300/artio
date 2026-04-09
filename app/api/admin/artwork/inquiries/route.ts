import { unstable_noStore as noStore } from "next/cache";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET() {
  noStore();
  try {
    await requireAdmin();

    const inquiries = await db.artworkInquiry.findMany({
      take: 200,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        buyerName: true,
        buyerEmail: true,
        message: true,
        artwork: {
          select: {
            title: true,
            slug: true,
          },
        },
      },
    });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDayCount = inquiries.reduce((count, inquiry) => {
      return inquiry.createdAt >= thirtyDaysAgo ? count + 1 : count;
    }, 0);

    return NextResponse.json({ inquiries, thirtyDayCount }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_artwork_inquiries_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
