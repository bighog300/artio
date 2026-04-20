"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Compass, Home, ImageIcon, MapPin, Menu, Search, Sparkles, UserCircle, Users } from "lucide-react";
import { usePathname } from "next/navigation";

type MobileBottomNavProps = {
  isAuthenticated: boolean;
};

type MobileBottomNavInnerProps = MobileBottomNavProps & { pathname: string };

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/venues", label: "Venues", icon: MapPin },
  { href: "/artists", label: "Artists", icon: Users },
  { href: "/artwork", label: "Artwork", icon: ImageIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
] as const;

const MORE_AUTH_ITEMS = [
  { href: "/events", label: "Events", icon: Sparkles },
  { href: "/galleries", label: "Galleries", icon: ImageIcon },
  { href: "/nearby", label: "Nearby", icon: Compass },
  { href: "/for-you", label: "For You", icon: Sparkles },
  { href: "/following", label: "Following", icon: Users },
  { href: "/saved", label: "Saved", icon: Home },
  { href: "/account", label: "Account", icon: UserCircle },
] as const;

const MORE_PUBLIC_ITEMS = [
  { href: "/events", label: "Events", icon: Sparkles },
  { href: "/nearby", label: "Nearby", icon: Compass },
  { href: "/search", label: "Search", icon: Search },
  { href: "/login", label: "Sign in", icon: UserCircle },
] as const;

const HIDE_NAV_PREFIXES = ["/admin", "/my", "/login", "/invite"] as const;

function isPathActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNavInner({ isAuthenticated, pathname }: MobileBottomNavInnerProps) {
  const [unread, setUnread] = useState(0);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/notifications/unread-count", { cache: "no-store" });
        if (!res.ok || !mounted) return;
        const data = (await res.json()) as { unread?: number };
        setUnread(typeof data.unread === "number" ? data.unread : 0);
      } catch {
        // noop
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onUnreadRefresh = () => {
      void load();
    };
    void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("notifications:unread-refresh", onUnreadRefresh);
    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("notifications:unread-refresh", onUnreadRefresh);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    setIsMoreOpen(false);
  }, [pathname]);

  const moreItems = useMemo(() => (isAuthenticated ? MORE_AUTH_ITEMS : MORE_PUBLIC_ITEMS), [isAuthenticated]);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background md:hidden" aria-label="Mobile navigation">
      {isMoreOpen ? (
        <div id="mobile-more-menu" className="border-b border-border bg-background px-3 py-2">
          <ul className="space-y-1">
            {moreItems.map((item) => {
              const Icon = item.icon;
              const isActive = isPathActive(pathname, item.href);
              return (
                <li key={`more-${item.href}`}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors ${isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    onClick={() => setIsMoreOpen(false)}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.href === "/account" && unread > 0 ? <span className="ml-auto inline-flex h-2 w-2 rounded-full bg-red-500" aria-label="Unread notifications" /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <ul className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const isActive = isPathActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className="relative flex flex-col items-center gap-1 px-2 py-2 text-[11px] text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-foreground" : "text-muted-foreground"}`} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            className="flex w-full flex-col items-center gap-1 px-2 py-2 text-[11px] text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={isMoreOpen}
            aria-controls="mobile-more-menu"
            onClick={() => setIsMoreOpen((prev) => !prev)}
          >
            <Menu className={`h-4 w-4 ${isMoreOpen ? "text-foreground" : "text-muted-foreground"}`} aria-hidden="true" />
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

export function MobileBottomNav({ isAuthenticated }: MobileBottomNavProps) {
  const pathname = usePathname() ?? "/";

  if (HIDE_NAV_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return null;

  return <MobileBottomNavInner isAuthenticated={isAuthenticated} pathname={pathname} />;
}
