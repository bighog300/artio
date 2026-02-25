import { unstable_noStore as noStore } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { hasDatabaseUrl } from "@/lib/runtime-db";
import { ForYouClient } from "@/components/recommendations/for-you-client";
import { PageHeader } from "@/components/ui/page-header";
import { GetStartedBanner } from "@/components/onboarding/get-started-banner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ForYouPage() {
  noStore();
  const user = await getSessionUser();
  if (!user) redirectToLogin("/for-you");

  if (!hasDatabaseUrl()) {
    return (
      <main className="space-y-4 p-6">
        <PageHeader title="For You" subtitle="Personalized picks based on your follows and engagement." />
        <p>Set DATABASE_URL to view personalized recommendations locally.</p>
      </main>
    );
  }

  return (
    <main className="space-y-4 p-6">
      <PageHeader title="For You" subtitle="Personalized picks based on your follows and engagement." />
      <GetStartedBanner />
      <ForYouClient />
    </main>
  );
}
