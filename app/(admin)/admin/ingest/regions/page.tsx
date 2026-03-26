import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import RegionsClient, {
  type RegionListResponse,
} from "@/app/(admin)/admin/ingest/regions/regions-client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { listIngestRegions } from "@/lib/ingest/regions-list";

export default async function AdminIngestRegionsPage() {
  await requireAdmin();

  let payload: RegionListResponse;
  try {
    payload = await listIngestRegions({ db });
  } catch {
    payload = { regions: [], total: 0, page: 1, pageSize: 20 };
  }

  return (
    <>
      <AdminPageHeader
        title="Region Queue"
        description="Add a country and region to queue autonomous venue discovery and event ingestion."
      />
      <RegionsClient initial={payload} />
    </>
  );
}
