import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import AdminSidebarNav from "./_components/AdminSidebarNav";

type AdminNavLink = {
  href: string;
  label: string;
};

type AdminNavSection = {
  label: string;
  links: AdminNavLink[];
};

export const ADMIN_SECTIONS: AdminNavSection[] = [
  {
    label: "Overview",
    links: [{ href: "/admin", label: "Dashboard" }],
  },
  {
    label: "Content",
    links: [
      { href: "/admin/events", label: "Events" },
      { href: "/admin/venues", label: "Venues" },
      { href: "/admin/venue-claims", label: "Venue Claims" },
      { href: "/admin/artists", label: "Artists" },
      { href: "/admin/artist-event-associations", label: "Artist associations" },
      { href: "/admin/artwork", label: "Artwork" },
      { href: "/admin/artwork-inquiries", label: "Enquiries" },
      { href: "/admin/tags", label: "Tags" },
    ],
  },
  {
    label: "Discovery",
    links: [
      { href: "/admin/ingest", label: "Ingest" },
      { href: "/admin/submissions", label: "Submissions" },
      { href: "/admin/curation", label: "Curation" },
    ],
  },
  {
    label: "Tools",
    links: [
      { href: "/admin/email", label: "Email" },
      { href: "/admin/analytics", label: "Analytics" },
      { href: "/admin/perf", label: "Performance" },
    ],
  },
  {
    label: "Config",
    links: [
      { href: "/admin/users", label: "Users" },
      { href: "/admin/branding", label: "Branding" },
      { href: "/admin/settings", label: "Settings" },
      { href: "/admin/beta", label: "Beta" },
      { href: "/admin/ops/jobs", label: "Jobs" },
      { href: "/admin/ops/audit", label: "Audit log" },
    ],
  },
];

async function getSidebarCounts() {
  try {
    const [submissions, ingest, venueClaims] = await Promise.all([
      db.submission.count({ where: { status: "IN_REVIEW" } }),
      db.ingestExtractedEvent.count({ where: { status: "PENDING", duplicateOfId: null } }),
      db.venueClaimRequest.count({ where: { status: "PENDING_VERIFICATION" } }),
    ]);
    return { submissions, ingest, venueClaims };
  } catch {
    return { submissions: null, ingest: null, venueClaims: null };
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
              "/admin/submissions": sidebarCounts.submissions,
              "/admin/ingest": sidebarCounts.ingest,
              "/admin/venue-claims": sidebarCounts.venueClaims,
            }}
          />
        </aside>
        <section>{children}</section>
      </div>
    </div>
  );
}
