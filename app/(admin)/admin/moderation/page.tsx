import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import ModerationClient from "./moderation-client";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const PAGE_SIZE = 30;

export default async function AdminModerationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin({ redirectOnFail: true });
  const params = await searchParams;
  const tab = typeof params.tab === "string" ? params.tab : "needs-review";
  const type = typeof params.type === "string" ? params.type : "all";
  const publisher = typeof params.publisher === "string" ? params.publisher : "";
  const submittedAfter = typeof params.submittedAfter === "string" ? params.submittedAfter : "";
  const source = typeof params.source === "string" ? params.source : "all";
  const sourceFilter = source === "ai" || source === "user" || source === "all" ? source : "all";
  const page = Math.max(1, Number(typeof params.page === "string" ? params.page : "1") || 1);

  const statusByTab = tab === "published" ? "APPROVED" : tab === "rejected" ? "REJECTED" : "IN_REVIEW";
  const where: Prisma.SubmissionWhereInput = {
    status: statusByTab as "IN_REVIEW" | "APPROVED" | "REJECTED",
    ...(type !== "all" ? { type: type.toUpperCase() as "EVENT" | "VENUE" | "ARTIST" | "ARTWORK" } : {}),
    ...(publisher ? { submitter: { email: { contains: publisher, mode: "insensitive" as const } } } : {}),
    ...(submittedAfter ? { submittedAt: { gte: new Date(submittedAfter) } } : {}),
    ...(sourceFilter === "ai"
      ? {
          details: {
            path: ["source"],
            string_contains: "ingest",
          },
        }
      : sourceFilter === "user"
        ? {
            OR: [
              { details: { equals: Prisma.DbNull } },
              {
                NOT: {
                  details: {
                    path: ["source"],
                    string_contains: "ingest",
                  },
                },
              },
            ],
          }
        : {}),
  };

  const [total, items] = await Promise.all([
    db.submission.count({ where }),
    db.submission.findMany({
      where,
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        status: true,
        type: true,
        submittedAt: true,
        createdAt: true,
        decisionReason: true,
        decidedAt: true,
        details: true,
        submitter: { select: { email: true, name: true } },
        targetEvent: { select: { id: true, title: true, slug: true } },
        targetVenue: { select: { id: true, name: true, slug: true } },
        targetArtist: { select: { id: true, name: true, slug: true } },
      },
    }),
  ]);

  return (
    <main className="space-y-6">
      <AdminPageHeader title="Moderation" description="Review and action submissions quickly." />
      <ModerationClient
        initialItems={items.map((item) => ({
          submissionId: item.id,
          status: item.status,
          entityType: item.type,
          title: item.targetEvent?.title ?? item.targetVenue?.name ?? item.targetArtist?.name ?? "Untitled",
          entityId: item.targetEvent?.id ?? item.targetVenue?.id ?? item.targetArtist?.id ?? "",
          slug: item.targetEvent?.slug ?? item.targetVenue?.slug ?? item.targetArtist?.slug ?? null,
          submittedAtISO: (item.submittedAt ?? item.createdAt).toISOString(),
          decisionReason: item.decisionReason ?? null,
          decidedAt: item.decidedAt?.toISOString() ?? null,
          publisher: item.submitter.name ?? item.submitter.email,
          isAiSource:
            item.details !== null &&
            typeof item.details === "object" &&
            !Array.isArray(item.details) &&
            typeof (item.details as Record<string, unknown>).source === "string" &&
            ((item.details as Record<string, unknown>).source as string).includes("ingest"),
        }))}
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        tab={tab}
        typeFilter={type}
        publisherFilter={publisher}
        submittedAfterFilter={submittedAfter}
        sourceFilter={sourceFilter}
      />
    </main>
  );
}
