export type AdminNavLink = {
  href: string;
  label: string;
};

export type AdminNavSection = {
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
