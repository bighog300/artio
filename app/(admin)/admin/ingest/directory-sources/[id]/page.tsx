import { notFound } from "next/navigation";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import EntitiesClient, { type DirectoryEntitiesResponse, type DirectorySourceDetail } from "@/app/(admin)/admin/ingest/directory-sources/[id]/entities-client";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DirectorySourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const source = await db.directorySource.findUnique({
    where: { id },
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
    },
  });

  if (!source) notFound();

  const entities = await db.directoryEntity.findMany({
    where: { directorySourceId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      entityUrl: true,
      entityName: true,
      matchedArtistId: true,
      lastSeenAt: true,
      createdAt: true,
    },
  });

  const total = await db.directoryEntity.count({ where: { directorySourceId: id } });

  const sourcePayload: DirectorySourceDetail = {
    id: source.id,
    name: source.name,
    baseUrl: source.baseUrl,
    entityType: source.entityType,
    crawlIntervalMinutes: source.crawlIntervalMinutes,
    cursor: source.cursor
      ? {
        ...source.cursor,
        lastRunAt: source.cursor.lastRunAt?.toISOString() ?? null,
        lastSuccessAt: source.cursor.lastSuccessAt?.toISOString() ?? null,
      }
      : null,
  };

  const entitiesPayload: DirectoryEntitiesResponse = {
    entities: entities.map((entity) => ({
      ...entity,
      createdAt: entity.createdAt.toISOString(),
      lastSeenAt: entity.lastSeenAt.toISOString(),
    })),
    total,
    page: 1,
    pageSize: 50,
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={source.name}
        description={source.baseUrl}
      />
      <section className="rounded-lg border bg-background p-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">{source.entityType}</Badge>
          <span>Crawl interval: {source.crawlIntervalMinutes} min</span>
          <span>Cursor: {source.cursor ? `${source.cursor.currentLetter} / p${source.cursor.currentPage}` : "Not started"}</span>
        </div>
      </section>
      <EntitiesClient source={sourcePayload} initial={entitiesPayload} />
    </div>
  );
}
