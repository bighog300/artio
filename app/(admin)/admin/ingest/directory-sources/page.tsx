import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import DirectorySourcesClient, { type DirectorySourcesListResponse } from "@/app/(admin)/admin/ingest/directory-sources/directory-sources-client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminDirectorySourcesPage() {
  await requireAdmin();

  let payload: DirectorySourcesListResponse = { sources: [] };
  try {
    const sources = await db.directorySource.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        cursor: {
          select: {
            currentLetter: true,
            currentPage: true,
            lastRunAt: true,
            lastSuccessAt: true,
            lastError: true,
          },
        },
        _count: { select: { entities: true } },
      },
    });

    payload = {
      sources: sources.map((source) => ({
        ...source,
        createdAt: source.createdAt.toISOString(),
        lastPipelineRunAt: source.lastPipelineRunAt?.toISOString() ?? null,
        cursor: source.cursor
          ? {
            ...source.cursor,
            lastRunAt: source.cursor.lastRunAt?.toISOString() ?? null,
            lastSuccessAt: source.cursor.lastSuccessAt?.toISOString() ?? null,
          }
          : null,
      })),
    };
  } catch {
    payload = { sources: [] };
  }

  return (
    <>
      <AdminPageHeader
        title="Directory sources"
        description="Register A–Z artist and venue directories for automated crawling."
      />
      <DirectorySourcesClient initial={payload} />
    </>
  );
}
