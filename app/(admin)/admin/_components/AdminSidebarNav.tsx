"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isRouteActive } from "./admin-sidebar-nav-utils";

type NavLink = {
  href: string;
  label: string;
};

type AdminSidebarNavProps = {
  userLinks: NavLink[];
  adminLinks: NavLink[];
};

export default function AdminSidebarNav({ userLinks, adminLinks }: AdminSidebarNavProps) {
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
      <div className="my-2 border-t" />
      {adminLinks.map((item) => {
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
    </nav>
  );
}
