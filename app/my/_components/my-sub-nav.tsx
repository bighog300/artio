"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const primaryTabs = [
  ["Overview", "/my"],
  ["Venues", "/my/venues"],
  ["Events", "/my/events"],
] as const;

const secondaryTabs = [
  ["Artwork", "/my/artwork"],
  ["Collection", "/my/collection"],
  ["Artist Profile", "/my/artist"],
  ["Team", "/my/team"],
  ["Analytics", "/my/analytics"],
  ["Settings", "/my/settings"],
] as const;

export function MySubNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const venueId = searchParams.get("venueId");
  const suffix = venueId ? `?venueId=${encodeURIComponent(venueId)}` : "";

  const renderTab = ([label, href]: readonly [string, string], tone: "primary" | "secondary") => {
    const active = pathname === href;
    const inactiveClass = tone === "secondary" ? "bg-muted/60 text-muted-foreground" : "bg-muted";

    return (
      <li key={href}>
        <Link href={`${href}${suffix}`} className={`rounded px-3 py-1 text-sm ${active ? "bg-foreground text-background" : inactiveClass}`}>
          {label}
        </Link>
      </li>
    );
  };

  return (
    <nav className="overflow-x-auto">
      <div className="flex min-w-max items-center justify-between gap-2 border-b pb-2">
        <ul className="flex min-w-max gap-2">
          {primaryTabs.map((tab) => renderTab(tab, "primary"))}
        </ul>
        <ul className="flex min-w-max gap-2">
          {secondaryTabs.map((tab) => renderTab(tab, "secondary"))}
        </ul>
      </div>
    </nav>
  );
}
