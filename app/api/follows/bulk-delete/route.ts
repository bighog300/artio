import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { guardUser } from "@/lib/auth-guard";
import { db } from "@/lib/db";
import { normalizeBulkDeleteTargets } from "@/lib/follows-manage";
import { followManageBulkDeleteSchema, parseBody, zodDetails } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await guardUser();
  if (user instanceof NextResponse) return user;
  try {
    const parsed = followManageBulkDeleteSchema.safeParse(await parseBody(req));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid bulk unfollow payload", zodDetails(parsed.error));

    const targets = normalizeBulkDeleteTargets(parsed.data.targets);
    const result = await db.follow.deleteMany({
      where: {
        userId: user.id,
        OR: targets,
      },
    });

    return NextResponse.json({ ok: true, deleted: result.count });
  } catch {
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
