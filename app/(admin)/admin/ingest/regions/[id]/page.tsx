import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function statusClassName(status: string): string {
  if (status === "RUNNING") return "bg-blue-100 text-blue-800";
  if (status === "SUCCEEDED") return "bg-green-100 text-green-800";
  if (status === "FAILED") return "bg-red-100 text-red-800";
  if (status === "PAUSED") return "bg-gray-100 text-gray-800";
  return "bg-zinc-100 text-zinc-800";
}

function formatDate(value: Date | null) {
  return value ? value.toLocaleString() : "—";
}

export default async function AdminIngestRegionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const region = await db.ingestRegion.findUnique({ where: { id } });
  if (!region) notFound();

  async function runNowAction() {
    "use server";
    await requireAdmin();

    const existing = await db.ingestRegion.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) notFound();

    await db.ingestRegion.update({
      where: { id },
      data: {
        status: "PENDING",
        nextRunAt: new Date(),
        venueGenDone: false,
        discoveryDone: false,
        errorMessage: null,
      },
    });

    redirect(`/admin/ingest/regions/${id}`);
  }

  async function pauseAction() {
    "use server";
    await requireAdmin();

    const existing = await db.ingestRegion.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) notFound();

    await db.ingestRegion.update({
      where: { id },
      data: { status: "PAUSED" },
    });

    redirect(`/admin/ingest/regions/${id}`);
  }

  const venueGenerationHref = `/admin/venue-generation?country=${encodeURIComponent(region.country)}&region=${encodeURIComponent(region.region)}`;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={`${region.country} / ${region.region}`}
        description="Region ingestion status and controls"
      />

      <section className="rounded-lg border bg-background p-4">
        <dl className="grid gap-3 md:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">Country</dt>
            <dd className="font-medium">{region.country}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Region</dt>
            <dd className="font-medium">{region.region}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Status</dt>
            <dd>
              <span
                className={`inline-flex rounded px-2 py-1 text-xs font-medium ${statusClassName(region.status)}`}
              >
                {region.status}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Phase completion</dt>
            <dd className="flex gap-4 text-sm">
              <span>
                Venue generation: {region.venueGenDone ? "✅" : "—"}
              </span>
              <span>Discovery: {region.discoveryDone ? "✅" : "—"}</span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Last run</dt>
            <dd>{formatDate(region.lastRunAt)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Next run</dt>
            <dd>{formatDate(region.nextRunAt)}</dd>
          </div>
        </dl>

        {region.errorMessage ? (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-semibold">Error</p>
            <p>{region.errorMessage}</p>
          </div>
        ) : null}

        <div className="mt-4 text-sm">
          <Link className="text-primary underline" href={venueGenerationHref}>
            View venue generation runs for this region
          </Link>
        </div>

        <div className="mt-6 flex gap-3">
          <form action={runNowAction}>
            <button
              type="submit"
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Run Now
            </button>
          </form>
          <form action={pauseAction}>
            <button
              type="submit"
              className="rounded-md border px-3 py-2 text-sm font-medium"
            >
              Pause
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
