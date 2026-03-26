"use client";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type EntityTabsProps = {
  artworks?: ReactNode;
  upcoming: ReactNode;
  past?: ReactNode;
  artists?: ReactNode;
  about: ReactNode;
  defaultTab?: "artworks" | "upcoming" | "past" | "artists" | "about";
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

export function EntityTabs({ artworks, upcoming, past, artists, about, defaultTab, counts }: EntityTabsProps) {
  const defaultValue = defaultTab ?? (artworks ? "artworks" : "upcoming");
  return (
    <Tabs defaultValue={defaultValue} className="space-y-4">
      <TabsList>
        {artworks ? <TabsTrigger value="artworks"><TabLabel label="Artworks" count={counts?.artworks} /></TabsTrigger> : null}
        <TabsTrigger value="upcoming"><TabLabel label="Upcoming" count={counts?.upcoming} /></TabsTrigger>
        {past ? <TabsTrigger value="past"><TabLabel label="Past" count={counts?.past} /></TabsTrigger> : null}
        {artists ? <TabsTrigger value="artists"><TabLabel label="Artists" count={counts?.artists} /></TabsTrigger> : null}
        <TabsTrigger value="about">About</TabsTrigger>
      </TabsList>
      {artworks ? <TabsContent value="artworks">{artworks}</TabsContent> : null}
      <TabsContent value="upcoming">{upcoming}</TabsContent>
      {past ? <TabsContent value="past">{past}</TabsContent> : null}
      {artists ? <TabsContent value="artists">{artists}</TabsContent> : null}
      <TabsContent value="about">{about}</TabsContent>
    </Tabs>
  );
}
