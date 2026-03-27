import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import DiscoveryClient from "@/app/(admin)/admin/ingest/discovery/discovery-client";
import { TemplatePerfSection } from "@/app/(admin)/admin/ingest/discovery/template-perf-section";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getTemplatePerfData } from "@/lib/discovery/template-perf-query";
import { listDiscoveryJobs, type DiscoveryListPayload } from "@/lib/ingest/discovery-list";

export default async function AdminIngestDiscoveryPage() {
  await requireAdmin();

  let payload: DiscoveryListPayload;
  let templatePerf = [] as Awaited<ReturnType<typeof getTemplatePerfData>>;

  try {
    [payload, templatePerf] = await Promise.all([
      listDiscoveryJobs({ db, page: 1, pageSize: 20 }),
      getTemplatePerfData(db),
    ]);
  } catch {
    payload = { jobs: [], total: 0, page: 1, pageSize: 20 };
    templatePerf = [];
  }

  return (
    <>
      <AdminPageHeader
        title="Search Discovery"
        description="Run search-grounded discovery jobs to seed ingest with new venue and artist URLs."
      />
      <DiscoveryClient initial={payload} />
      <TemplatePerfSection initialRows={templatePerf} />
    </>
  );
}
