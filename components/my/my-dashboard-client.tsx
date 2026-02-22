"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type DashboardPayload = {
  needsOnboarding?: boolean;
  message?: string;
  nextHref?: string;
  stats: {
    artworks: { total: number; published: number; drafts: number; missingCover: number };
    events: { total: number; upcoming30: number; drafts: number; missingVenue: number; nextEvent?: { id: string; title: string; startAtISO: string; venueName?: string | null } };
    venues: { totalManaged: number; published: number; drafts: number; submissionsPending: number };
    views: { last7: number; last30: number; last90: number };
    profile: { completenessPct: number; missing: string[] };
  };
  entities: {
    venues: Array<{ id: string; slug?: string | null; name: string; city?: string | null; country?: string | null; isPublished: boolean; coverUrl?: string | null; submissionStatus?: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | null }>;
  };
  actionInbox: Array<{ id: string; label: string; count: number; href: string; severity: "info" | "warn" }>;
  topArtworks30: Array<{ id: string; slug?: string | null; title: string; coverUrl?: string | null; views30: number }>;
  recent: Array<{ label: string; href: string; occurredAtISO: string }>;
  links: {
    addArtworkHref: string;
    addEventHref: string;
    analyticsHref: string;
    artworksHref: string;
    eventsHref: string;
    artistHref: string;
    venuesHref: string;
    venuesNewHref: string;
  };
};

function getVenueStatus(venue: DashboardPayload["entities"]["venues"][number]) {
  if (venue.submissionStatus === "SUBMITTED") return "Submitted";
  if (venue.submissionStatus === "REJECTED") return "Needs edits";
  if (venue.isPublished) return "Published";
  return "Draft";
}

export function MyDashboardClient() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/my/dashboard", { cache: "no-store" });
    const payload = await response.json() as DashboardPayload;
    setData(payload);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, idx) => <Skeleton key={idx} className="h-32 w-full" />)}</div>;
  if (!data) return null;

  if (data.needsOnboarding) {
    return (
      <Card>
        <CardHeader><CardTitle>Welcome to Publisher Dashboard</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{data.message}</p>
          <Button asChild><Link href={data.nextHref || "/my/artist"}>Set up artist profile</Link></Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-base">Artworks</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{data.stats.artworks.total}</p><p className="text-xs text-muted-foreground">{data.stats.artworks.published} published · {data.stats.artworks.drafts} drafts</p><div className="mt-2 flex items-center gap-2"><Badge variant="secondary">Missing cover: {data.stats.artworks.missingCover}</Badge></div><Link className="mt-2 block text-sm underline" href={data.links.artworksHref}>Manage artworks</Link></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Events</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{data.stats.events.total}</p><p className="text-xs text-muted-foreground">{data.stats.events.upcoming30} in next 30 days</p><div className="mt-2 flex items-center gap-2"><Badge variant="secondary">Missing venue: {data.stats.events.missingVenue}</Badge></div><Link className="mt-2 block text-sm underline" href={data.links.eventsHref}>Manage events</Link></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Views (30d)</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{data.stats.views.last30}</p><p className="text-xs text-muted-foreground">7d: {data.stats.views.last7} · 90d: {data.stats.views.last90}</p><Link className="mt-2 block text-sm underline" href={data.links.analyticsHref}>View analytics</Link></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{data.stats.profile.completenessPct}%</p><p className="text-xs text-muted-foreground">Missing: {data.stats.profile.missing.join(", ") || "None"}</p><Link className="mt-2 block text-sm underline" href={data.links.artistHref}>Update profile</Link></CardContent></Card>
      </section>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>My venues</CardTitle>
          <Link className="text-sm underline" href={data.links.venuesHref}>View all venues</Link>
        </CardHeader>
        <CardContent>
          {data.entities.venues.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 sm:p-5">
              <p className="font-medium">Create your first venue</p>
              <p className="mt-1 text-sm text-muted-foreground">Add your venue so you can publish events and manage your profile.</p>
              <Button asChild className="mt-4"><Link href={data.links.venuesNewHref}>+ Create venue</Link></Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {data.entities.venues.map((venue) => (
                <li key={venue.id}>
                  <Link href={`/my/venues/${venue.id}`} className="flex items-center gap-3 rounded-md border p-2 transition-colors hover:bg-muted/50 sm:p-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted sm:h-12 sm:w-12">
                      {venue.coverUrl ? <img src={venue.coverUrl} alt="" className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{venue.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{[venue.city, venue.country].filter(Boolean).join(", ") || "Location not set"}</p>
                    </div>
                    <Badge variant="secondary">{getVenueStatus(venue)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>To do</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {data.actionInbox.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge variant={item.severity === "warn" ? "destructive" : "secondary"}>{item.count}</Badge>
                  <span className="text-sm">{item.label}</span>
                </div>
                <Link className="text-sm underline" href={item.href}>Fix</Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.recent.map((item) => (
                <li key={`${item.href}-${item.occurredAtISO}`} className="text-sm">
                  <Link className="underline" href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top artworks (30d)</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.topArtworks30.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link className="underline" href={`/artwork/${item.slug || item.id}`}>{item.title}</Link>
                  <span className="text-muted-foreground">{item.views30} views</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
