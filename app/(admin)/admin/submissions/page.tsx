import Link from "next/link";
import { db } from "@/lib/db";
import SubmissionsModeration from "@/app/(admin)/admin/_components/SubmissionsModeration";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";

export const dynamic = "force-dynamic";

const allowedStatuses = ["IN_REVIEW", "APPROVED", "REJECTED"] as const;
type StatusFilter = (typeof allowedStatuses)[number];
const allowedTypes = ["EVENT", "VENUE", "ARTIST", "ARTWORK"] as const;
type TypeFilter = (typeof allowedTypes)[number] | "ALL";

export default async function AdminSubmissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const resolved = await searchParams;
  const inputStatus = typeof resolved.status === "string" ? resolved.status : "IN_REVIEW";
  const status: StatusFilter = allowedStatuses.includes(inputStatus as StatusFilter) ? (inputStatus as StatusFilter) : "IN_REVIEW";
  const inputType = typeof resolved.type === "string" ? resolved.type : "ALL";
  const type: TypeFilter = inputType === "ALL" || allowedTypes.includes(inputType as (typeof allowedTypes)[number]) ? (inputType as TypeFilter) : "ALL";

  const items = await db.submission.findMany({
    where: { status, ...(type === "ALL" ? {} : { type }) },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    include: {
      submitter: { select: { email: true, name: true } },
      venue: { select: { id: true, name: true } },
      targetEvent: { select: { id: true, title: true, slug: true, startAt: true, eventType: true, description: true, venue: { select: { name: true } }, images: { select: { id: true, url: true, alt: true }, take: 4, orderBy: { sortOrder: "asc" } } } },
      targetVenue: { select: { id: true, name: true, slug: true, city: true, country: true, claimStatus: true, aiGenerated: true, description: true, images: { select: { id: true, url: true, alt: true }, take: 4, orderBy: { sortOrder: "asc" } } } },
      targetArtist: { select: { id: true, name: true, slug: true } },
    },
  });

  return (
    <main className="p-6 space-y-3">
      <AdminPageHeader
        title="Submissions"
        description="Review and action content submitted by users via the public submission form."
      />
      <div className="flex gap-2 text-sm">
        {allowedStatuses.map((s) => (
          <Link key={s} href={`/admin/submissions?status=${s}&type=${type}`} className={`rounded border px-3 py-1 ${s === status ? "bg-neutral-100" : ""}`}>
            {s[0]}{s.slice(1).toLowerCase()}
          </Link>
        ))}
      </div>
      <div className="flex gap-2 text-sm">
        {["ALL", ...allowedTypes].map((t) => (
          <Link key={t} href={`/admin/submissions?status=${status}&type=${t}`} className={`rounded border px-3 py-1 ${t === type ? "bg-neutral-100" : ""}`}>
            {t}
          </Link>
        ))}
      </div>
      <SubmissionsModeration
        items={items.map((item) => ({
          id: item.id,
          status: item.status,
          type: item.type,
          note: item.note,
          decisionReason: item.decisionReason,
          submittedAt: item.submittedAt?.toISOString() ?? null,
          decidedAt: item.decidedAt?.toISOString() ?? null,
          submitter: item.submitter,
          venue: item.venue,
          createdAt: item.createdAt.toISOString(),
          targetEvent: item.targetEvent ? {
            ...item.targetEvent,
            startAt: item.targetEvent.startAt.toISOString(),
          } : null,
          targetVenue: item.targetVenue,
          targetArtist: item.targetArtist,
        }))}
      />
    </main>
  );
}
