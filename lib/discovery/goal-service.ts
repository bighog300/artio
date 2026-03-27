import type { PrismaClient } from "@prisma/client";
import { getGoalConversionStats } from "@/lib/discovery/conversion-query";

export async function createDiscoveryGoal(
  db: PrismaClient,
  args: {
    entityType: "VENUE" | "ARTIST" | "EVENT";
    region: string;
    country: string;
    targetCount: number;
    notes?: string | null;
    createdById: string;
  },
): Promise<{ id: string }> {
  if (args.targetCount < 1 || args.targetCount > 1000) {
    throw new Error("invalid_target_count");
  }

  return db.discoveryGoal.create({
    data: {
      entityType: args.entityType,
      region: args.region,
      country: args.country,
      targetCount: args.targetCount,
      notes: args.notes ?? null,
      createdById: args.createdById,
    },
    select: { id: true },
  });
}

export async function getGoalProgress(
  db: PrismaClient,
  goalId: string,
): Promise<{
  queued: number;
  seeded: number;
  published: number;
  jobCount: number;
  lastJobAt: Date | null;
  venuesWithApprovedEvents: number;
  totalApprovedEvents: number;
}> {
  const [jobAgg, seeded, published, lastJob, conversion] = await Promise.all([
    db.ingestDiscoveryJob.aggregate({
      where: { goalId },
      _count: { id: true },
      _sum: { candidatesQueued: true },
    }),
    db.ingestDiscoveryCandidate.count({
      where: {
        job: { goalId },
        seededVenueId: { not: null },
      },
    }),
    db.venue.count({
      where: {
        status: "PUBLISHED",
        discoverySeeds: {
          some: {
            job: { goalId },
          },
        },
      },
    }),
    db.ingestDiscoveryJob.findFirst({
      where: { goalId },
      orderBy: [{ createdAt: "desc" }],
      select: { createdAt: true },
    }),
    getGoalConversionStats(db, goalId),
  ]);

  return {
    queued: jobAgg._sum.candidatesQueued ?? 0,
    seeded,
    published,
    jobCount: jobAgg._count.id,
    lastJobAt: lastJob?.createdAt ?? null,
    venuesWithApprovedEvents: conversion.venuesWithApprovedEvents,
    totalApprovedEvents: conversion.totalApprovedEvents,
  };
}

export async function checkAndCompleteGoal(
  db: PrismaClient,
  goalId: string,
): Promise<void> {
  const goal = await db.discoveryGoal.findUnique({
    where: { id: goalId },
    select: { id: true, targetCount: true, status: true },
  });

  if (!goal) {
    return;
  }

  const progress = await getGoalProgress(db, goalId);
  if (goal.status === "ACTIVE" && progress.seeded >= goal.targetCount) {
    await db.discoveryGoal.update({
      where: { id: goal.id },
      data: { status: "COMPLETED" },
    });
  }
}
