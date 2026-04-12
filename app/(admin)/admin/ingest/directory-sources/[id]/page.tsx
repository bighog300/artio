import Link from "next/link";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import EntitiesClient, { type DirectoryEntitiesResponse, type DirectorySourceDetail } from "@/app/(admin)/admin/ingest/directory-sources/[id]/entities-client";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import LogsClient from "./logs-client";

export const dynamic = "force-dynamic";

export default async function DirectorySourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const source = await db.directorySource.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      baseUrl: true,
      entityType: true,
      crawlIntervalMinutes: true,
      linkPattern: true,
      lastRunFound: true,
      lastRunStrategy: true,
      lastRunError: true,
      siteProfileId: true,
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


  // Fetch ingestion paths if site profile is linked
  let ingestionPaths: Array<{
    id: string;
    name: string;
    baseUrl: string;
    contentType: string;
    enabled: boolean;
    lastRunAt: string | null;
    lastRunFound: number | null;
  }> = [];

  if (source.siteProfileId) {
    const profile = await db.siteProfile.findUnique({
      where: { id: source.siteProfileId },
      select: {
        hostname: true,
        paths: {
          select: {
            id: true,
            name: true,
            baseUrl: true,
            contentType: true,
            enabled: true,
            lastRunAt: true,
            lastRunFound: true,
          },
          orderBy: { contentType: "asc" },
        },
      },
    });
    ingestionPaths = (profile?.paths ?? []).map((path) => ({
      ...path,
      lastRunAt: path.lastRunAt?.toISOString() ?? null,
    }));
  }

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
    linkPattern: source.linkPattern,
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
          <span>Interval: {source.crawlIntervalMinutes} min</span>
          <span>Cursor: {source.cursor ? `${source.cursor.currentLetter} / p${source.cursor.currentPage}` : "Not started"}</span>
          {source.lastRunStrategy ? (
            <Badge variant="outline">Strategy: {source.lastRunStrategy}</Badge>
          ) : null}
          {source.lastRunFound != null ? (
            <span>{source.lastRunFound} found last run</span>
          ) : null}
          {source.linkPattern ? (
            <span className="font-mono text-xs text-muted-foreground">Pattern: {source.linkPattern}</span>
          ) : null}
          {source.cursor?.lastError ? (
            <span className="text-destructive text-xs">Error: {source.cursor.lastError}</span>
          ) : null}
          {source.lastRunError ? (
            <span className="text-destructive text-xs">Last run error: {source.lastRunError}</span>
          ) : null}
          <Link href="/admin/ingest/artworks" className="text-sm underline">
            Review extracted artworks →
          </Link>
        </div>
      </section>

      {ingestionPaths.length > 0 ? (
        <section className="rounded-lg border bg-background p-4 text-sm space-y-2">
          <div className="font-medium text-sm">Ingestion paths</div>
          <div className="space-y-1">
            {ingestionPaths.map((path) => (
              <div key={path.id} className="flex items-center gap-2 text-xs">
                <span className={`rounded px-1.5 py-0.5 ${
                  path.contentType === "artist" ? "bg-purple-100 text-purple-800"
                    : path.contentType === "event" ? "bg-blue-100 text-blue-800"
                      : path.contentType === "exhibition" ? "bg-amber-100 text-amber-700"
                        : "bg-muted text-muted-foreground"
                }`}>{path.contentType}</span>
                <span className="font-medium">{path.name}</span>
                <span className="text-muted-foreground truncate">{path.baseUrl}</span>
                <span className={`ml-auto rounded px-1 ${path.enabled ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
                  {path.enabled ? "enabled" : "disabled"}
                </span>
                {path.lastRunFound != null ? (
                  <span className="text-muted-foreground">{path.lastRunFound} found</span>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <Tabs defaultValue="entities">
        <TabsList>
          <TabsTrigger value="entities">Entities</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="entities">
          <EntitiesClient source={sourcePayload} initial={entitiesPayload} />
        </TabsContent>
        <TabsContent value="logs">
          <LogsClient sourceId={source.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
