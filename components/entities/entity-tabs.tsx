"use client";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParams } from "next/navigation";

type EntityTabsProps = {
  artworks?: ReactNode;
  upcoming: ReactNode;
  past?: ReactNode;
  artists?: ReactNode;
  cv?: ReactNode;
  about: ReactNode;
  defaultTab?: "artworks" | "upcoming" | "past" | "artists" | "cv" | "about";
  counts?: TabCounts;
};

type TabCounts = {
  artworks?: number;
  upcoming?: number;
  past?: number;
  artists?: number;
};

function TabLabel({ label, count }: { label: string; count?: number }) {
  return (
    <span className="flex items-center gap-1.5">
      {label}
      {count != null && count > 0 ? (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {count}
        </span>
      ) : null}
    </span>
  );
}

export function EntityTabs({ artworks, upcoming, past, artists, cv, about, defaultTab, counts }: EntityTabsProps) {
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const allowedTabs = new Set(["artworks", "upcoming", "past", "artists", "cv", "about"]);
  const requestedTab = urlTab && allowedTabs.has(urlTab) ? urlTab : null;
  const defaultValue = requestedTab ?? defaultTab ?? (artworks ? "artworks" : "upcoming");
  return (
    <Tabs defaultValue={defaultValue} className="space-y-4">
      <TabsList>
        {artworks ? <TabsTrigger value="artworks"><TabLabel label="Artworks" count={counts?.artworks} /></TabsTrigger> : null}
        <TabsTrigger value="upcoming"><TabLabel label="Upcoming" count={counts?.upcoming} /></TabsTrigger>
        {past ? <TabsTrigger value="past"><TabLabel label="Past" count={counts?.past} /></TabsTrigger> : null}
        {artists ? <TabsTrigger value="artists"><TabLabel label="Artists" count={counts?.artists} /></TabsTrigger> : null}
        {cv ? <TabsTrigger value="cv">CV</TabsTrigger> : null}
        <TabsTrigger value="about">About</TabsTrigger>
      </TabsList>
      {artworks ? <TabsContent value="artworks">{artworks}</TabsContent> : null}
      <TabsContent value="upcoming">{upcoming}</TabsContent>
      {past ? <TabsContent value="past">{past}</TabsContent> : null}
      {artists ? <TabsContent value="artists">{artists}</TabsContent> : null}
      {cv ? <TabsContent value="cv">{cv}</TabsContent> : null}
      <TabsContent value="about">{about}</TabsContent>
    </Tabs>
  );
}
