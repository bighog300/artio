import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import AdminPageHeader from "../_components/AdminPageHeader";
import { ArtistEventAssociationsClient } from "./associations-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminArtistEventAssociationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin({ redirectOnFail: true });
  const params = await searchParams;
  const statusFilter =
    typeof params.status === "string" &&
    ["PENDING", "APPROVED", "REJECTED"].includes(params.status)
      ? params.status
      : "PENDING";

  const associations = await db.artistEventAssociation.findMany({
    where: { status: statusFilter },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      role: true,
      message: true,
      createdAt: true,
      artist: { select: { id: true, name: true, slug: true } },
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          startAt: true,
          venue: { select: { name: true } },
        },
      },
    },
  });

  return (
    <main className="space-y-6">
      <AdminPageHeader
        title="Artist Event Associations"
        description="Review artist requests to be linked to events."
      />
      <ArtistEventAssociationsClient
        initialItems={associations.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
          event: { ...a.event, startAt: a.event.startAt.toISOString() },
        }))}
        currentStatus={statusFilter}
      />
    </main>
  );
}
