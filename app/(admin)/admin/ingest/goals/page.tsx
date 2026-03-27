import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { GoalsClient } from "@/app/(admin)/admin/ingest/goals/goals-client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGoalProgress } from "@/lib/discovery/goal-service";

export const dynamic = "force-dynamic";

export default async function DiscoveryGoalsPage() {
  await requireAdmin();

  const [goals, groupedCounts] = await Promise.all([
    db.discoveryGoal.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ createdAt: "desc" }],
      include: { _count: { select: { jobs: true } } },
    }),
    db.discoveryGoal.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
  ]);

  const goalsWithProgress = await Promise.all(
    goals.map(async (goal) => ({
      ...goal,
      progress: await getGoalProgress(db, goal.id),
    })),
  );

  const statusCounts = {
    ACTIVE: groupedCounts.find((row) => row.status === "ACTIVE")?._count.id ?? 0,
    PAUSED: groupedCounts.find((row) => row.status === "PAUSED")?._count.id ?? 0,
    COMPLETED: groupedCounts.find((row) => row.status === "COMPLETED")?._count.id ?? 0,
    CANCELLED: groupedCounts.find((row) => row.status === "CANCELLED")?._count.id ?? 0,
  };

  return (
    <>
      <AdminPageHeader
        title="Discovery goals"
        description="Define measurable discovery targets and track seeded/published progress by region."
      />
      <GoalsClient goals={goalsWithProgress} statusCounts={statusCounts} />
    </>
  );
}
