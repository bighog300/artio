import type { PrismaClient } from "@prisma/client";
import { getRegionConversionStats } from "@/lib/discovery/conversion-query";
import { getGoalProgress } from "@/lib/discovery/goal-service";

export type RegionCoverageRow = {
  region: string;
  country: string;
  totalVenues: number;
  publishedVenues: number;
  eventsLast30d: number;
  venuesWithApprovedEvents: number;
  totalApprovedEvents: number;
  lastDiscoveryRun: Date | null;
  activeGoal: {
    id: string;
    targetCount: number;
    seeded: number;
  } | null;
};

export async function getRegionCoverageData(
  db: PrismaClient,
): Promise<RegionCoverageRow[]> {
  const ingestRegions = await db.ingestRegion.findMany({
    select: {
      id: true,
      region: true,
      country: true,
      lastRunAt: true,
    },
  });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const rows = await Promise.all(
    ingestRegions.map(async (ingestRegion) => {
      const whereRegionMatch = {
        deletedAt: null,
        OR: [
          { region: { equals: ingestRegion.region, mode: "insensitive" as const } },
          { city: { equals: ingestRegion.region, mode: "insensitive" as const } },
        ],
      };

      const [totalVenues, publishedVenues, eventsLast30d, activeGoal, conversion] = await Promise.all([
        db.venue.count({ where: whereRegionMatch }),
        db.venue.count({
          where: {
            ...whereRegionMatch,
            status: "PUBLISHED",
          },
        }),
        db.event.count({
          where: {
            status: "PUBLISHED",
            startAt: { gte: since },
            venue: whereRegionMatch,
          },
        }),
        db.discoveryGoal.findFirst({
          where: {
            status: "ACTIVE",
            entityType: "VENUE",
            region: { equals: ingestRegion.region, mode: "insensitive" },
          },
          orderBy: [{ createdAt: "desc" }],
          select: {
            id: true,
            targetCount: true,
          },
        }),
        getRegionConversionStats(db, {
          region: ingestRegion.region,
          country: ingestRegion.country,
        }),
      ]);

      let activeGoalData: RegionCoverageRow["activeGoal"] = null;
      if (activeGoal) {
        const progress = await getGoalProgress(db, activeGoal.id);
        activeGoalData = {
          id: activeGoal.id,
          targetCount: activeGoal.targetCount,
          seeded: progress.seeded,
        };
      }

      return {
        region: ingestRegion.region,
        country: ingestRegion.country,
        totalVenues,
        publishedVenues,
        eventsLast30d,
        venuesWithApprovedEvents: conversion.venuesWithApprovedEvents,
        totalApprovedEvents: conversion.totalApprovedEvents,
        lastDiscoveryRun: ingestRegion.lastRunAt,
        activeGoal: activeGoalData,
      };
    }),
  );

  return rows.sort((a, b) => b.publishedVenues - a.publishedVenues);
}
