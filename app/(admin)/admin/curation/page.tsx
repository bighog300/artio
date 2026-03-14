import { AdminCurationClient } from "./curation-client";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function AdminCurationPage() {
  await requireAdmin({ redirectOnFail: true });

  return (
    <main className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Editorial curation</h1>
        <p className="text-sm text-muted-foreground">Create site collections and control public rails.</p>
      </div>
      <AdminCurationClient />
    </main>
  );
}
