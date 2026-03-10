import { db } from "@/lib/db";
import AdminPageHeader from "../_components/AdminPageHeader";
import { AdminTagsClient } from "./tags-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminTagsPage() {
  const tags = await db.tag.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      _count: { select: { eventTags: true } },
    },
  });

  return (
    <main className="space-y-6">
      <AdminPageHeader title="Tags" description="Manage the semantic taste graph taxonomy for events." />
      <AdminTagsClient initialTags={tags} />
    </main>
  );
}
