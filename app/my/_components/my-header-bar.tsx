"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { enqueueToast } from "@/lib/toast";

type VenueOption = {
  id: string;
  name: string;
  role: "OWNER" | "EDITOR";
};

type MyHeaderBarProps = {
  venues: VenueOption[];
  hasArtistProfile: boolean;
};

export function MyHeaderBar({ venues: initialVenues, hasArtistProfile: initialHasArtistProfile }: MyHeaderBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const venueId = searchParams.get("venueId") ?? "";
  const [venues] = useState(initialVenues);
  const [hasArtistProfile] = useState(initialHasArtistProfile);

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

  const onVenueChangeRef = useRef(onVenueChange);
  useEffect(() => {
    onVenueChangeRef.current = onVenueChange;
  }, [onVenueChange]);

  useEffect(() => {
    if (!venueId || venues.length === 0) {
      return;
    }
    const hasVenueAccess = venues.some((venue) => venue.id === venueId);
    if (hasVenueAccess) {
      return;
    }
    onVenueChangeRef.current("", "replace");
    enqueueToast({
      title: "Venue not found",
      message: "Showing all venues instead.",
      variant: "error",
    });
  }, [venueId, venues]);

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
              <Button id="venue-selector" size="sm" variant="outline">
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
          <Button asChild size="sm"><Link href={venueId ? `/my/events/new?venueId=${encodeURIComponent(venueId)}` : "/my/events/new"}>+ Event</Link></Button>
          <Button asChild size="sm" variant="secondary"><Link href="/my/venues/new">+ Venue</Link></Button>
          <Button asChild size="sm" variant="secondary"><Link href="/my/artwork/new">+ Artwork</Link></Button>
          {!hasArtistProfile ? (
            <Button asChild size="sm" variant="outline"><Link href="/my/artist">Create Artist Profile</Link></Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
