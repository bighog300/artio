import { db } from "@/lib/db";
import { requireEditor } from "@/lib/auth";
import { StatusBadge } from "@/components/publishing/StatusBadge";
import { notifySavedSearchMatches } from "@/lib/saved-searches/notify-saved-search-matches";

export const dynamic = "force-dynamic";

async function reviewAction(formData: FormData) {
  "use server";
  await requireEditor();

  const entityType = String(formData.get("entityType") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const action = String(formData.get("action") ?? "");
  const reviewNotes = String(formData.get("reviewNotes") ?? "");

  const now = new Date();
  const nextStatus = action === "approve" ? "PUBLISHED" : action === "request_changes" ? "CHANGES_REQUESTED" : "ARCHIVED";

  if (entityType === "EVENT") {
    await db.event.update({ where: { id: entityId }, data: { status: nextStatus, reviewedAt: now, reviewNotes: reviewNotes || null, isPublished: nextStatus === "PUBLISHED" } });
    if (nextStatus === "PUBLISHED") await notifySavedSearchMatches(entityId);
  } else if (entityType === "VENUE") {
    await db.venue.update({ where: { id: entityId }, data: { status: nextStatus, reviewedAt: now, reviewNotes: reviewNotes || null, isPublished: nextStatus === "PUBLISHED" } });
  } else if (entityType === "ARTIST") {
    await db.artist.update({ where: { id: entityId }, data: { status: nextStatus, reviewedAt: now, reviewNotes: reviewNotes || null, isPublished: nextStatus === "PUBLISHED" } });
  }
}

export default async function AdminReviewPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requireEditor();
  const { type } = await searchParams;
  const typeFilter = type === "EVENT" || type === "VENUE" || type === "ARTIST" ? type : "ALL";

  const [events, venues, artists] = await Promise.all([
    db.event.findMany({ where: { status: "IN_REVIEW", ...(typeFilter === "ALL" || typeFilter === "EVENT" ? {} : { id: "__none__" }) }, select: { id: true, title: true, submittedAt: true, submissions: { orderBy: { createdAt: "desc" }, take: 1, select: { submitter: { select: { email: true } } } } } }),
    db.venue.findMany({ where: { status: "IN_REVIEW", ...(typeFilter === "ALL" || typeFilter === "VENUE" ? {} : { id: "__none__" }) }, select: { id: true, name: true, submittedAt: true, submissions: { orderBy: { createdAt: "desc" }, take: 1, select: { submitter: { select: { email: true } } } } } }),
    db.artist.findMany({ where: { status: "IN_REVIEW", ...(typeFilter === "ALL" || typeFilter === "ARTIST" ? {} : { id: "__none__" }) }, select: { id: true, name: true, submittedAt: true, user: { select: { email: true } } } }),
  ]);

  const rows = [
    ...events.map((item) => ({ entityType: "EVENT", id: item.id, title: item.title, submittedBy: item.submissions[0]?.submitter.email ?? "Unknown", submittedAt: item.submittedAt })),
    ...venues.map((item) => ({ entityType: "VENUE", id: item.id, title: item.name, submittedBy: item.submissions[0]?.submitter.email ?? "Unknown", submittedAt: item.submittedAt })),
    ...artists.map((item) => ({ entityType: "ARTIST", id: item.id, title: item.name, submittedBy: item.user?.email ?? "Unknown", submittedAt: item.submittedAt })),
  ].sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0));

  return (
    <main className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Unified Review Queue</h1>
      <div className="flex gap-2 text-sm">
        {(["ALL", "EVENT", "VENUE", "ARTIST"] as const).map((value) => <a key={value} href={`/admin/review?type=${value}`} className={`rounded border px-3 py-1 ${typeFilter === value ? "bg-muted" : ""}`}>{value}</a>)}
      </div>
      <div className="overflow-x-auto rounded border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2">Type</th>
              <th className="p-2">Title/Name</th>
              <th className="p-2">Submitted by</th>
              <th className="p-2">Submitted at</th>
              <th className="p-2">Status</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.entityType}-${row.id}`} className="border-t align-top">
                <td className="p-2">{row.entityType}</td>
                <td className="p-2">{row.title}</td>
                <td className="p-2">{row.submittedBy}</td>
                <td className="p-2">{row.submittedAt ? row.submittedAt.toLocaleString() : "—"}</td>
                <td className="p-2"><StatusBadge status="IN_REVIEW" /></td>
                <td className="p-2">
                  <form action={reviewAction} className="space-y-2">
                    <input type="hidden" name="entityType" value={row.entityType} />
                    <input type="hidden" name="entityId" value={row.id} />
                    <input name="reviewNotes" aria-label="Review notes" className="w-full rounded border px-2 py-1" placeholder="Notes (optional)" />
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded border px-2 py-1" name="action" value="approve" type="submit">Approve</button>
                      <button className="rounded border px-2 py-1" name="action" value="request_changes" type="submit">Request changes</button>
                      <button className="rounded border px-2 py-1" name="action" value="archive" type="submit">Archive</button>
                    </div>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
