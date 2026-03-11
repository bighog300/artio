import { unstable_noStore as noStore } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { hasDatabaseUrl } from "@/lib/runtime-db";
import { db } from "@/lib/db";
import { ForYouClient } from "@/components/recommendations/for-you-client";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { GetStartedBanner } from "@/components/onboarding/get-started-banner";
import { getAuthDebugRequestMeta, logAuthDebug } from "@/lib/auth-debug";

// Auth-gated page: keep Node runtime so `getSessionUser()` (NextAuth `getServerSession`) can
// reliably read session cookies in production deployments and avoid login redirect loops.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ForYouPage() {
  noStore();
  const user = await getSessionUser();
  if (!user) {
    const requestMeta = await getAuthDebugRequestMeta();
    logAuthDebug("for-you.page.redirect_to_login", {
      ...requestMeta,
      userExists: false,
      redirectTarget: "/login?next=%2Ffor-you",
    });
    redirectToLogin("/for-you");
  }

  if (!hasDatabaseUrl()) {
    return (
      <main className="space-y-4 p-6">
        <PageHeader title="For You" subtitle="Personalized picks based on your follows and engagement." />
        <p>Set DATABASE_URL to view personalized recommendations locally.</p>
      </main>
    );
  }

  const [followCount, savedSearchCount] = await Promise.all([
    db.follow.count({ where: { userId: user.id } }),
    db.savedSearch.count({ where: { userId: user.id } }),
  ]);

  const isFirstRun = followCount === 0 && savedSearchCount === 0;

  return (
    <main className="space-y-4 p-6">
      <PageHeader title="For You" subtitle="Personalized picks based on your follows and engagement." />
      <GetStartedBanner />
      {isFirstRun ? (
        <EmptyState
          title="Personalise your feed"
          description="Follow artists and venues you love to see their events here."
          actions={[
            { label: "Discover artists", href: "/artists" },
            { label: "Browse venues", href: "/venues" },
          ]}
        />
      ) : <ForYouClient />}
    </main>
  );
}
