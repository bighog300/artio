import { CalendarClient } from "@/app/calendar/calendar-client";
import { PageHeader } from "@/components/ui/page-header";
import { PageShell } from "@/components/ui/page-shell";
import { DataSourceEmptyState } from "@/components/ui/data-source-empty-state";
import { getSessionUser } from "@/lib/auth";
import { hasDatabaseUrl } from "@/lib/runtime-db";
import { uiFixtureEvents, useUiFixtures as getUiFixturesEnabled } from "@/lib/ui-fixtures";

export const dynamic = "force-dynamic";
const fixturesEnabled = getUiFixturesEnabled();

export default async function CalendarPage() {
  const user = await getSessionUser();

  if (!hasDatabaseUrl() && !fixturesEnabled) {
    return (
      <PageShell className="page-stack">
        <PageHeader title="Calendar" subtitle="Your saved and followed events" />
        <DataSourceEmptyState isAdmin={user?.role === "ADMIN"} showDevHint={process.env.NODE_ENV === "development"} />
      </PageShell>
    );
  }

  return (
    <PageShell className="page-stack">
      <PageHeader title="Calendar" subtitle="Your saved and followed events" />
      <CalendarClient isAuthenticated={Boolean(user)} fixtureItems={fixturesEnabled && !hasDatabaseUrl() ? uiFixtureEvents.map((event) => ({ id: event.id, title: event.title, slug: event.slug, start: event.startAt, end: event.endAt, venue: event.venue, artistIds: event.artistIds })) : undefined} fallbackFixtureItems={fixturesEnabled ? uiFixtureEvents.map((event) => ({ id: event.id, title: event.title, slug: event.slug, start: event.startAt, end: event.endAt, venue: event.venue, artistIds: event.artistIds })) : undefined} />
    </PageShell>
  );
}
