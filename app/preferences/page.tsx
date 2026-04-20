import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { GetStartedEntryPoint } from "@/components/onboarding/get-started-entry-point";
import { PreferencesPanel } from "@/components/personalization/preferences-panel";
import { DigestPreferencesPanel } from "@/components/personalization/digest-preferences-panel";
import { NotificationPreferencesPanel } from "@/components/personalization/notification-preferences-panel";
import { db } from "@/lib/db";

export default async function PreferencesPage() {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/preferences");

  const [digestPreferences, notificationPreferences] = await Promise.all([
    db.user.findUnique({
    where: { id: user.id },
    select: { digestEventsOnly: true, digestMaxEvents: true, digestRadiusKm: true },
  }),
    db.userNotificationPrefs.findUnique({
      where: { userId: user.id },
      select: {
        eventRemindersEnabled: true,
        followedCreatorUpdatesEnabled: true,
        nearbyRecommendationsEnabled: true,
        quietHoursEnabled: true,
        quietHoursStartHour: true,
        quietHoursEndHour: true,
      },
    }),
  ]);

  return (
    <main className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Preferences</h1>
      <p className="text-sm text-muted-foreground">Your recommendations improve when you follow artists/venues, set your location, and save searches.</p>
      <GetStartedEntryPoint />
      <PreferencesPanel />
      <NotificationPreferencesPanel initial={{
        eventRemindersEnabled: notificationPreferences?.eventRemindersEnabled ?? true,
        followedCreatorUpdatesEnabled: notificationPreferences?.followedCreatorUpdatesEnabled ?? true,
        nearbyRecommendationsEnabled: notificationPreferences?.nearbyRecommendationsEnabled ?? true,
        quietHoursEnabled: notificationPreferences?.quietHoursEnabled ?? false,
        quietHoursStartHour: notificationPreferences?.quietHoursStartHour ?? 22,
        quietHoursEndHour: notificationPreferences?.quietHoursEndHour ?? 8,
      }} />
      <DigestPreferencesPanel initial={{
        digestEventsOnly: digestPreferences?.digestEventsOnly ?? false,
        digestMaxEvents: digestPreferences?.digestMaxEvents ?? 10,
        digestRadiusKm: digestPreferences?.digestRadiusKm ?? null,
      }} />
      <div className="grid gap-3 md:grid-cols-2">
        <Link href="/following" className="rounded border p-4 hover:bg-muted"><p className="font-medium">Manage follows</p><p className="text-sm text-muted-foreground">Adjust your feed signals and discover via artists/venues.</p></Link>
        <Link href="/saved" className="rounded border p-4 hover:bg-muted"><p className="font-medium">Saved</p><p className="text-sm text-muted-foreground">Review saved events and artworks.</p></Link>
        <Link href="/account" className="rounded border p-4 hover:bg-muted"><p className="font-medium">Location settings</p><p className="text-sm text-muted-foreground">Set your home area for nearby recommendations.</p></Link>
        <Link href="/saved-searches" className="rounded border p-4 hover:bg-muted"><p className="font-medium">Saved searches</p><p className="text-sm text-muted-foreground">Control recurring alerts and runs.</p></Link>
        <Link href="/notifications" className="rounded border p-4 hover:bg-muted"><p className="font-medium">Notifications</p><p className="text-sm text-muted-foreground">Choose what to review and mark as read.</p></Link>
      </div>
      <p className="text-sm">Discovery shortcuts: <Link href="/artists" className="underline">Artists</Link> · <Link href="/venues" className="underline">Venues</Link></p>
    </main>
  );
}
