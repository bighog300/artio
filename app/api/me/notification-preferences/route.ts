import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError } from "@/lib/api";
import { requireAuth, isAuthError } from "@/lib/auth";
import { parseBody, zodDetails } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  eventRemindersEnabled: z.boolean().optional(),
  followedCreatorUpdatesEnabled: z.boolean().optional(),
  nearbyRecommendationsEnabled: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStartHour: z.number().int().min(0).max(23).nullable().optional(),
  quietHoursEndHour: z.number().int().min(0).max(23).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "At least one field must be provided" });

const DEFAULTS = {
  eventRemindersEnabled: true,
  followedCreatorUpdatesEnabled: true,
  nearbyRecommendationsEnabled: true,
  quietHoursEnabled: false,
  quietHoursStartHour: 22,
  quietHoursEndHour: 8,
};

export async function GET() {
  try {
    const user = await requireAuth();
    const prefs = await db.userNotificationPrefs.findUnique({
      where: { userId: user.id },
      select: {
        eventRemindersEnabled: true,
        followedCreatorUpdatesEnabled: true,
        nearbyRecommendationsEnabled: true,
        quietHoursEnabled: true,
        quietHoursStartHour: true,
        quietHoursEndHour: true,
      },
    });

    return NextResponse.json({
      ...DEFAULTS,
      ...prefs,
      quietHoursStartHour: prefs?.quietHoursStartHour ?? DEFAULTS.quietHoursStartHour,
      quietHoursEndHour: prefs?.quietHoursEndHour ?? DEFAULTS.quietHoursEndHour,
    });
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth();
    const parsed = patchSchema.safeParse(await parseBody(req));
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid payload", zodDetails(parsed.error));

    const updated = await db.userNotificationPrefs.upsert({
      where: { userId: user.id },
      update: {
        ...parsed.data,
      },
      create: {
        userId: user.id,
        emailOnSubmissionResult: true,
        emailOnTeamInvite: true,
        weeklyDigest: false,
        ...DEFAULTS,
        ...parsed.data,
      },
      select: {
        eventRemindersEnabled: true,
        followedCreatorUpdatesEnabled: true,
        nearbyRecommendationsEnabled: true,
        quietHoursEnabled: true,
        quietHoursStartHour: true,
        quietHoursEndHour: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
