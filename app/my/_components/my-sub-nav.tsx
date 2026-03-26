"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
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
  ["Inquiries", "/my/artist/inquiries"],
  ["Team", "/my/team"],
  ["Analytics", "/my/analytics"],
  ["Settings", "/my/settings"],
] as const;

type MySubNavProps = {
  unreadInquiryCount?: number;
};

export function MySubNav({ unreadInquiryCount = 0 }: MySubNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const venueId = searchParams.get("venueId");
  const suffix = venueId ? `?venueId=${encodeURIComponent(venueId)}` : "";

  const renderTab = ([label, href]: readonly [string, string], tone: "primary" | "secondary") => {
    const active = href === "/my"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");
    const inactiveClass = tone === "secondary" ? "bg-muted/60 text-muted-foreground" : "bg-muted";

    return (
      <li key={href}>
        <Link href={`${href}${suffix}`} className={`inline-flex items-center gap-1 rounded px-3 py-1 text-sm ${active ? "bg-foreground text-background" : inactiveClass}`}>
          <span>{label}</span>
          {href === "/my/artist/inquiries" && unreadInquiryCount > 0 ? (
            <Badge
              variant="secondary"
              className="h-5 min-w-5 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold leading-none text-amber-800"
            >
              {unreadInquiryCount}
            </Badge>
          ) : null}
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
