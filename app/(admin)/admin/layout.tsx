import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin";
import AdminSidebarNav from "./_components/AdminSidebarNav";

const ADMIN_LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/venues", label: "Venues" },
  { href: "/admin/venue-images", label: "Venue images" },
  { href: "/admin/venue-generation", label: "Venue Generation" },
  { href: "/admin/venue-claims", label: "Venue Claims" },
  { href: "/admin/tags", label: "Tags" },
  { href: "/admin/artists", label: "Artists" },
  { href: "/admin/artist-event-associations", label: "Artist Event Assoc." },
  { href: "/admin/artwork", label: "Artwork" },
  { href: "/admin/artwork-inquiries", label: "Enquiries" },
  { href: "/admin/ingest", label: "Ingest" },
  { href: "/admin/submissions", label: "Submissions" },
  { href: "/admin/perf", label: "Performance" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/beta", label: "Beta" },
  { href: "/admin/ops/jobs", label: "Jobs" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/branding", label: "Branding" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/curation", label: "Curation" },
  { href: "/admin/ops/audit", label: "Audit Log" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

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
            adminLinks={ADMIN_LINKS}
          />
        </aside>
        <section>{children}</section>
      </div>
    </div>
  );
}
