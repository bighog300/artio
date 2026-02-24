"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MyDashboardResponseSchema } from "@/lib/my/dashboard-schema";
import { enqueueToast } from "@/lib/toast";

type VenueOption = {
  id: string;
  name: string;
  role: "OWNER" | "EDITOR";
};

export function MyHeaderBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const venueId = searchParams.get("venueId") ?? "";
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [hasArtistProfile, setHasArtistProfile] = useState(true);
  const [loading, setLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const onVenueChange = useCallback((value: string, mode: "push" | "replace" = "push") => {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) params.delete("venueId");
    else params.set("venueId", value);
    const query = params.toString();
    const nextUrl = query ? `${pathname}?${query}` : pathname;
    if (mode === "replace") {
      router.replace(nextUrl);
      return;
    }
    router.push(nextUrl);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const controller = new AbortController();

    const loadVenues = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/my/dashboard", { signal: controller.signal });
        if (!response.ok) {
          setDashboardError(`Unable to load dashboard (status ${response.status}).`);
          return;
        }
        const payload = await response.json();
        const parsed = MyDashboardResponseSchema.safeParse(payload);
        if (!parsed.success) {
          console.error("dashboard parse failed");
          setDashboardError("Unable to load dashboard (invalid response).");
          return;
        }
        setDashboardError(null);
        setVenues(parsed.data.context.venues);
        setHasArtistProfile(parsed.data.context.hasArtistProfile);
      } catch {
        setDashboardError("Unable to load dashboard (invalid response).");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadVenues();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!venueId || venues.length === 0) {
      return;
    }
    const hasVenueAccess = venues.some((venue) => venue.id === venueId);
    if (hasVenueAccess) {
      return;
    }
    onVenueChange("", "replace");
    enqueueToast({
      title: "Venue not found",
      message: "Showing all venues instead.",
      variant: "error",
    });
  }, [onVenueChange, venueId, venues]);

  const selectedVenueLabel = useMemo(() => {
    if (!venueId) {
      return "All venues";
    }
    const selectedVenue = venues.find((venue) => venue.id === venueId);
    return selectedVenue?.name ?? "Unknown venue";
  }, [venueId, venues]);

  return (
    <header className="sticky top-0 z-20 rounded border bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Publisher Command Center</h1>
          <p className="text-sm text-muted-foreground">Overview and controls for venues, events, artwork, and team.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="venue-selector">Venue</label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button id="venue-selector" size="sm" variant="outline" disabled={loading}>
                {selectedVenueLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onVenueChange("")}>All venues</DropdownMenuItem>
              <DropdownMenuSeparator />
              {venues.map((venue) => (
                <DropdownMenuItem key={venue.id} onSelect={() => onVenueChange(venue.id)}>
                  {venue.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button asChild size="sm"><Link href="/my/events/new">+ Event</Link></Button>
          <Button asChild size="sm" variant="secondary"><Link href="/my/venues/new">+ Venue</Link></Button>
          <Button asChild size="sm" variant="secondary"><Link href="/my/artwork/new">+ Artwork</Link></Button>
          {!hasArtistProfile ? (
            <Button asChild size="sm" variant="outline"><Link href="/my/artist">Create Artist Profile</Link></Button>
          ) : null}
        </div>
      </div>
      {dashboardError ? <p className="mt-2 text-sm text-destructive">{dashboardError}</p> : null}
    </header>
  );
}
