import { getSessionUser } from "@/lib/auth";
import { LogoutButton } from "@/app/account/logout-button";
import { db } from "@/lib/db";
import { OnboardingPanel } from "@/components/onboarding/onboarding-panel";
import { LocationSettings } from "@/app/account/location-settings";
import { AccountPageTabs } from "@/app/account/account-page-tabs";
import { redirectToLogin } from "@/lib/auth-redirect";
import { GetStartedEntryPoint } from "@/components/onboarding/get-started-entry-point";
import { PageShell } from "@/components/ui/page-shell";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
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
    <PageShell className="page-stack">
      <h1 className="text-2xl font-semibold">Account</h1>
      <OnboardingPanel />
      <GetStartedEntryPoint />
      <AccountPageTabs
        email={user.email}
        role={user.role}
        unreadCount={unreadCount}
        profileContent={(
          <LocationSettings
            initial={{
              locationLabel: location?.locationLabel ?? "",
              lat: location?.locationLat != null ? String(location.locationLat) : "",
              lng: location?.locationLng != null ? String(location.locationLng) : "",
              radiusKm: String(location?.locationRadiusKm ?? 25),
            }}
          />
        )}
      />
      <LogoutButton />
    </PageShell>
  );
}
