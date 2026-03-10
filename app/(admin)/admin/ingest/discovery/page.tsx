import { headers } from "next/headers";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import DiscoveryClient, { type DiscoveryListResponse } from "@/app/(admin)/admin/ingest/discovery/discovery-client";
import { requireAdmin } from "@/lib/auth";

export default async function AdminIngestDiscoveryPage() {
  await requireAdmin();

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = h.get("x-forwarded-proto") ?? "http";
  const response = await fetch(`${protocol}://${host}/api/admin/ingest/discovery`, {
    headers: { cookie: h.get("cookie") ?? "" },
    cache: "no-store",
  });

  const payload = response.ok
    ? await response.json() as DiscoveryListResponse
    : { jobs: [], total: 0, page: 1, pageSize: 20 };

  return (
    <>
      <AdminPageHeader
        title="Search Discovery"
        description="Run search-grounded discovery jobs to seed ingest with new venue and artist URLs."
      />
      <DiscoveryClient initial={payload} />
    </>
  );
}
