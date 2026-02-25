import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { LogoutButton } from "@/app/account/logout-button";
import { db } from "@/lib/db";
import { OnboardingPanel } from "@/components/onboarding/onboarding-panel";
import { LocationSettings } from "@/app/account/location-settings";
import { redirectToLogin } from "@/lib/auth-redirect";
import { GetStartedEntryPoint } from "@/components/onboarding/get-started-entry-point";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountPage() {
  noStore();
  const user = await getSessionUser();
  if (!user) redirectToLogin("/account");

  const [unreadCount, location] = await Promise.all([
    db.notification.count({ where: { userId: user.id, status: "UNREAD" } }),
    db.user.findUnique({
      where: { id: user.id },
      select: { locationLabel: true, locationLat: true, locationLng: true, locationRadiusKm: true },
    }),
  ]);

  return (
    <main className="space-y-2 p-6">
      <h1 className="text-2xl font-semibold">Account</h1>
      <OnboardingPanel />
      <GetStartedEntryPoint />
      <p>{user.email}</p>
      <p>Role: {user.role}</p>
      <p><Link className="underline" href="/my/venues">Manage my venues</Link></p>
      <p><Link className="underline" href="/notifications">Notifications ({unreadCount})</Link></p>
      <p><Link className="underline" href="/for-you">For You recommendations</Link></p>
      <p><Link className="underline" href="/preferences">Preferences</Link></p>
      <LocationSettings
        initial={{
          locationLabel: location?.locationLabel ?? "",
          lat: location?.locationLat != null ? String(location.locationLat) : "",
          lng: location?.locationLng != null ? String(location.locationLng) : "",
          radiusKm: String(location?.locationRadiusKm ?? 25),
        }}
      />
      <LogoutButton />
    </main>
  );
}
