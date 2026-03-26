import { db } from "@/lib/db";

type DiscoveryListDb = Pick<typeof db, "ingestDiscoveryJob">;

export type DiscoveryListPayload = {
  jobs: Array<{
    id: string;
    entityType: "VENUE" | "ARTIST" | "EVENT";
    queryTemplate: string;
    region: string;
    searchProvider: string;
    maxResults: number;
    status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
    resultsCount: number | null;
    errorMessage: string | null;
    createdAt: string;
    _count: { candidates: number };
  }>;
  total: number;
  page: number;
  pageSize: number;
};

export async function listDiscoveryJobs(args: { db: DiscoveryListDb; page?: number; pageSize?: number }): Promise<DiscoveryListPayload> {
  const page = Number.isFinite(args.page) && (args.page ?? 0) > 0 ? Math.trunc(args.page as number) : 1;
  const pageSize = Number.isFinite(args.pageSize) && (args.pageSize ?? 0) > 0 ? Math.trunc(args.pageSize as number) : 20;

  const [jobs, total] = await Promise.all([
    args.db.ingestDiscoveryJob.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { candidates: true } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    args.db.ingestDiscoveryJob.count(),
  ]);

  return {
    jobs: jobs.map((job) => ({ ...job, createdAt: job.createdAt.toISOString() })),
    total,
    page,
    pageSize,
  };
}
