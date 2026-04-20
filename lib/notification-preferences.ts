import { db } from "@/lib/db";

export type EffectiveNotificationPreferences = {
  eventRemindersEnabled: boolean;
  followedCreatorUpdatesEnabled: boolean;
  nearbyRecommendationsEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStartHour: number;
  quietHoursEndHour: number;
};

const DEFAULT_PREFS: EffectiveNotificationPreferences = {
  eventRemindersEnabled: true,
  followedCreatorUpdatesEnabled: true,
  nearbyRecommendationsEnabled: true,
  quietHoursEnabled: false,
  quietHoursStartHour: 22,
  quietHoursEndHour: 8,
};

export async function getEffectiveNotificationPreferences(userId: string): Promise<EffectiveNotificationPreferences> {
  const prefs = await db.userNotificationPrefs.findUnique({
    where: { userId },
    select: {
      eventRemindersEnabled: true,
      followedCreatorUpdatesEnabled: true,
      nearbyRecommendationsEnabled: true,
      quietHoursEnabled: true,
      quietHoursStartHour: true,
      quietHoursEndHour: true,
    },
  });

  return {
    ...DEFAULT_PREFS,
    ...prefs,
    quietHoursStartHour: prefs?.quietHoursStartHour ?? DEFAULT_PREFS.quietHoursStartHour,
    quietHoursEndHour: prefs?.quietHoursEndHour ?? DEFAULT_PREFS.quietHoursEndHour,
  };
}

export function isWithinQuietHours(now: Date, prefs: EffectiveNotificationPreferences) {
  if (!prefs.quietHoursEnabled) return false;
  const start = prefs.quietHoursStartHour;
  const end = prefs.quietHoursEndHour;
  const hour = now.getUTCHours();

  if (start === end) return true;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}
