import Link from "next/link";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { hasDatabaseUrl } from "@/lib/runtime-db";
import { getFollowingFeedWithDeps, type FollowingFeedTypeFilter } from "@/lib/following-feed";
import { RecommendedFollows } from "@/components/onboarding/recommended-follows";
import { redirectToLogin } from "@/lib/auth-redirect";
import { setOnboardingFlagForSession } from "@/lib/onboarding";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { PersonalSection } from "@/components/personal/personal-section";
import { PersonalEventFeed } from "@/components/personal/personal-event-feed";
import { FollowedEntitiesGrid } from "@/components/personal/followed-entities-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";
import { OnboardingGate } from "@/components/onboarding/onboarding-gate";
import { StartPacks } from "@/components/onboarding/start-packs";
import { PostActivationTips } from "@/components/onboarding/post-activation-tips";
import { SetupChecklistCard } from "@/components/onboarding/setup-checklist-card";
import { ContextualNudgeSlot } from "@/components/onboarding/contextual-nudge-slot";

type SearchParams = Promise<{ days?: string; type?: string }>;

export const dynamic = "force-dynamic";

export default async function FollowingPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireAuth().catch(() => redirectToLogin("/following"));

  if (!hasDatabaseUrl()) {
    return (
      <PageShell className="page-stack">
      <PageViewTracker name="following_viewed" />
        <PageHeader title="Following" subtitle="Updates from artists and venues you follow" actions={<Link href="/following/manage" className="rounded border px-3 py-1 text-sm">Manage</Link>} />
        <EmptyState title="Following feed unavailable" description="Set DATABASE_URL to load personalized following updates in local development." actions={[{ label: "Manage follows", href: "/following/manage", variant: "secondary" }]} />
      </PageShell>
    );
  }

  const params = await searchParams;
  const days: 7 | 30 = params.days === "30" ? 30 : 7;
  const type: FollowingFeedTypeFilter = params.type === "artist" || params.type === "venue" ? params.type : "both";

  const [result, followCount] = await Promise.all([
    getFollowingFeedWithDeps(
      {
        now: () => new Date(),
        findFollows: async (userId) => db.follow.findMany({ where: { userId }, select: { targetType: true, targetId: true } }),
        findEvents: async ({ artistIds, venueIds, from, to, limit }) => db.event.findMany({
          where: {
            isPublished: true,
            startAt: { gte: from, lte: to },
            AND: [{
              OR: [
                ...(venueIds.length ? [{ venueId: { in: venueIds } }] : []),
                ...(artistIds.length ? [{ eventArtists: { some: { artistId: { in: artistIds } } } }] : []),
              ],
            }],
          },
          take: limit,
          orderBy: [{ startAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            slug: true,
            title: true,
            startAt: true,
            endAt: true,
            venue: { select: { name: true, slug: true } },
          },
        }),
      },
      { userId: user.id, days, type, limit: 50 },
    ),
    db.follow.count({ where: { userId: user.id } }),
    setOnboardingFlagForSession(user, "hasVisitedFollowing", true, { path: "/following" }),
  ]);

  const hasNoFollows = followCount === 0;

  return (
    <PageShell className="page-stack">
      <PageHeader title="Following" subtitle="Updates from artists and venues you follow" actions={<Link href="/following/manage" className="rounded border px-3 py-1 text-sm">Manage</Link>} />
      <OnboardingGate page="following" isAuthenticated />
      <SetupChecklistCard page="following" />
      <PostActivationTips />

      {followCount > 0 && result.items.length === 0 ? <ContextualNudgeSlot page="following" type="following_save_search" nudgeId="nudge_following_save_search" title="Make your feed work harder" body="Save your first search to get weekly digests matching your interests." destination="/search" /> : null}

      <PersonalSection
        title="Your feed"
        description="Upcoming events from your followed artists and venues."
        actions={<Link className="text-sm underline" href="/api/calendar-events/saved/ical">Subscribe to your saved events calendar</Link>}
      >
        <PersonalEventFeed items={result.items} selectedDays={String(days) as "7" | "30"} selectedType={type} hasNoFollows={hasNoFollows} />
      </PersonalSection>

      <PersonalSection title="Followed artists & venues" description="Search and manage everyone you follow." actions={<Link className="text-sm underline" href="/following/manage">Advanced manage</Link>}>
        <FollowedEntitiesGrid />
      </PersonalSection>

      <PersonalSection title="Suggested for you" description="Based on what you follow.">
        {hasNoFollows ? <StartPacks page="following" isAuthenticated /> : null}
        <RecommendedFollows page="following" source={hasNoFollows ? "following_empty" : "following_page"} isAuthenticated />
      </PersonalSection>
    </PageShell>
  );
}
