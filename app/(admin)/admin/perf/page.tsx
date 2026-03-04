import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import PerfAdminClient from "@/app/(admin)/admin/perf/perf-admin-client";
import { requireAdmin } from "@/lib/admin";

export default async function AdminPerfPage() {
  await requireAdmin();

  return (
    <main className="p-6 space-y-4">
      <AdminPageHeader
        title="Performance Diagnostics"
        description="Run admin-only EXPLAIN snapshots on whitelisted read-only queries."
        backHref="/admin"
        backLabel="Back to Admin"
      />
      <PerfAdminClient />
    </main>
  );
}
