"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isRouteActive } from "./admin-sidebar-nav-utils";

type NavLink = {
  href: string;
  label: string;
};

type NavSection = {
  label: string;
  links: NavLink[];
};

type AdminSidebarNavProps = {
  userLinks: NavLink[];
  adminSections: NavSection[];
  pendingCounts?: Record<string, number | null>;
};

export default function AdminSidebarNav({ userLinks, adminSections, pendingCounts }: AdminSidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1" aria-label="Admin navigation">
      <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">User side</p>
      {userLinks.map((item) => {
        const isActive = isRouteActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "block w-full rounded-md border-l-2 px-3 py-2 text-sm transition-colors",
              isActive
                ? "border-primary bg-muted font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
      {adminSections.map((section) => (
        <div key={section.label}>
          <div className="my-2 border-t" />
          <p className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{section.label}</p>
          {section.links.map((item) => {
            const isActive = isRouteActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "block w-full rounded-md border-l-2 px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "border-primary bg-muted font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span>{item.label}</span>
                  {(pendingCounts?.[item.href] ?? 0) > 0 ? (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-amber-800">
                      {pendingCounts![item.href]}
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
