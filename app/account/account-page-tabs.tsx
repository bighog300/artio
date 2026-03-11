"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type RegistrationItem = {
  id: string;
  confirmationCode: string;
  guestEmail: string;
  status: "PENDING" | "CONFIRMED" | "WAITLISTED" | "CANCELLED";
  event: { title: string; slug: string; startAt: string; venue: { name: string } | null };
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function AccountPageTabs({
  email,
  role,
  unreadCount,
  profileContent,
}: {
  email: string;
  role: string;
  unreadCount: number;
  profileContent: React.ReactNode;
}) {
  const [upcoming, setUpcoming] = useState<RegistrationItem[]>([]);
  const [past, setPast] = useState<RegistrationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showPast, setShowPast] = useState(false);

  async function load() {
    setIsLoading(true);
    const res = await fetch("/api/registrations/mine", { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setUpcoming(Array.isArray(body.upcoming) ? body.upcoming : []);
      setPast(Array.isArray(body.past) ? body.past : []);
    }
    setIsLoading(false);
  }

  const loaded = useMemo(() => upcoming.length > 0 || past.length > 0, [past.length, upcoming.length]);

  async function cancelRegistration(confirmationCode: string, guestEmail: string) {
    await fetch(`/api/registrations/${confirmationCode}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ guestEmail }),
    });
    await load();
  }

  return (
    <Tabs defaultValue="profile" className="space-y-4">
      <TabsList>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="rsvps" onClick={() => { if (!loaded && !isLoading) void load(); }}>My RSVPs</TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="space-y-2">
        <p>{email}</p>
        <p>Role: {role}</p>
        <p><Link className="underline" href="/my/venues">Manage my venues</Link></p>
        <p><Link className="underline" href="/notifications">Notifications ({unreadCount})</Link></p>
        <p><Link className="underline" href="/for-you">For You recommendations</Link></p>
        <p><Link className="underline" href="/preferences">Preferences</Link></p>
        {profileContent}
      </TabsContent>

      <TabsContent value="rsvps" className="space-y-4">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading RSVPs...</p> : null}

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Upcoming</h2>
          {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">No upcoming RSVPs.</p> : (
            <ul className="space-y-2">
              {upcoming.map((item) => (
                <li key={item.id} className="rounded border p-3 text-sm">
                  <p className="font-medium"><Link className="underline" href={`/events/${item.event.slug}`}>{item.event.title}</Link></p>
                  <p className="text-muted-foreground">{formatDate(item.event.startAt)} · {item.event.venue?.name ?? "Venue TBA"}</p>
                  <p className="text-muted-foreground">Code: {item.confirmationCode}</p>
                  <div className="flex gap-2">
                    <Button asChild type="button" variant="outline" size="sm"><Link href={`/my/registrations/${item.confirmationCode}/transfer`}>Transfer</Link></Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void cancelRegistration(item.confirmationCode, item.guestEmail)}>Cancel</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <button type="button" className="text-sm underline" onClick={() => setShowPast((current) => !current)}>{showPast ? "Hide past RSVPs" : "Show past RSVPs"}</button>
          {showPast ? (
            past.length === 0 ? <p className="text-sm text-muted-foreground">No past RSVPs.</p> : (
              <ul className="space-y-2">
                {past.map((item) => (
                  <li key={item.id} className="rounded border p-3 text-sm">
                    <p className="font-medium"><Link className="underline" href={`/events/${item.event.slug}`}>{item.event.title}</Link></p>
                    <p className="text-muted-foreground">{formatDate(item.event.startAt)} · {item.event.venue?.name ?? "Venue TBA"}</p>
                    <p className="text-muted-foreground">Code: {item.confirmationCode}</p>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </section>
      </TabsContent>
    </Tabs>
  );
}
