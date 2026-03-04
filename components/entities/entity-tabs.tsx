"use client";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type EntityTabsProps = { artworks?: ReactNode; upcoming: ReactNode; about: ReactNode };

export function EntityTabs({ artworks, upcoming, about }: EntityTabsProps) {
  const defaultValue = artworks ? "artworks" : "upcoming";
  return (
    <Tabs defaultValue={defaultValue} className="space-y-4">
      <TabsList>
        {artworks ? <TabsTrigger value="artworks">Artworks</TabsTrigger> : null}
        <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
        <TabsTrigger value="about">About</TabsTrigger>
      </TabsList>
      {artworks ? <TabsContent value="artworks">{artworks}</TabsContent> : null}
      <TabsContent value="upcoming">{upcoming}</TabsContent>
      <TabsContent value="about">{about}</TabsContent>
    </Tabs>
  );
}
