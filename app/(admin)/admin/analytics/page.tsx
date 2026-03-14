import { hasDatabaseUrl } from "@/lib/runtime-db";
import AnalyticsAdminClient from "@/app/(admin)/admin/analytics/analytics-admin-client";
import { requireAdmin } from "@/lib/admin";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";

export default async function AdminAnalyticsPage() {
  await requireAdmin({ redirectOnFail: true });

  return (
    <main className="space-y-4 p-6">
      <AdminPageHeader
        title="Analytics"
        description="Privacy-safe aggregated engagement metrics only (no user lists or raw streams)."
        backHref="/admin"
        backLabel="Back to Admin"
      />
      {hasDatabaseUrl() ? (
        <AnalyticsAdminClient />
      ) : (
        <p className="rounded border p-3 text-sm text-neutral-700">Set DATABASE_URL to view analytics.</p>
      )}
    </main>
  );
}
