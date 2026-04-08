import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import AdminSidebarNav from "./_components/AdminSidebarNav";
import { ADMIN_SECTIONS } from "./_components/admin-nav-sections";

async function getSidebarCounts() {
  try {
    const [moderationQueue, ingest, venueClaims, readyArtists, readyArtworks, accessRequests, artworkOrders] = await Promise.all([
      db.submission.count({ where: { status: "IN_REVIEW" } }),
      db.ingestExtractedEvent.count({ where: { status: "PENDING", duplicateOfId: null } }),
      db.venueClaimRequest.count({ where: { status: "PENDING_VERIFICATION" } }),
      db.artist.count({ where: { status: "IN_REVIEW", isAiDiscovered: true, deletedAt: null } }),
      db.artwork.count({ where: { status: "IN_REVIEW", deletedAt: null, ingestCandidate: { isNot: null } } }),
      db.accessRequest.count({ where: { status: "PENDING" } }),
      db.artworkOrder.count({ where: { status: "PENDING" } }),
    ]);
    return { moderationQueue, ingest, venueClaims, readyToPublish: readyArtists + readyArtworks, accessRequests, artworkOrders };
  } catch {
    return { moderationQueue: null, ingest: null, venueClaims: null, readyToPublish: null, accessRequests: null, artworkOrders: null };
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [admin, sidebarCounts] = await Promise.all([
    requireAdmin({ redirectOnFail: true }),
    getSidebarCounts(),
  ]);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background px-6 py-3">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Artio</p>
            <h1 className="text-lg font-semibold">Admin Panel</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/my">← Back to Publisher Dashboard</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/">View Public Site</Link>
            </Button>
            <div className="text-sm text-muted-foreground">{admin.email}</div>
          </div>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 p-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-lg border bg-background p-3">
          <AdminSidebarNav
            userLinks={[
              { href: "/my", label: "Publisher Dashboard" },
              { href: "/", label: "Public Home" },
            ]}
            adminSections={ADMIN_SECTIONS}
            pendingCounts={{
              "/admin/submissions": sidebarCounts.moderationQueue,
              "/admin/moderation": sidebarCounts.moderationQueue,
              "/admin/ingest": sidebarCounts.ingest,
              "/admin/venue-claims": sidebarCounts.venueClaims,
              "/admin/artwork-orders": sidebarCounts.artworkOrders,
              "/admin/ingest/ready-to-publish": sidebarCounts.readyToPublish,
              "/admin/access-requests": sidebarCounts.accessRequests,
            }}
          />
        </aside>
        <section>{children}</section>
      </div>
    </div>
  );
}
