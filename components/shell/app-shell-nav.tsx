"use client";

import Link from "next/link";
import { Menu, Search, Bell, UserCircle, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthShellNav } from "./auth-shell-nav";

type ShellUser = {
  role: "USER" | "EDITOR" | "ADMIN";
};

type AppShellNavProps = {
  user: ShellUser | null;
  isAdmin: boolean;
  logoUrl: string | null;
};

type NavLink = { label: string; href: string };

const PRIMARY_LINKS: NavLink[] = [
  { label: "Events", href: "/events" },
  { label: "Nearby", href: "/nearby" },
  { label: "Calendar", href: "/calendar" },
  { label: "Following", href: "/following" },
  { label: "Venues", href: "/venues" },
  { label: "Artists", href: "/artists" },
  { label: "Artwork", href: "/artwork" },
];

const HIDE_NAV_PREFIXES = ["/admin"];
const AUTH_NAV_PREFIXES = ["/login", "/invite"];

export type ShellNavMode = "hidden" | "auth" | "full";

export function getShellNavMode(pathname: string): ShellNavMode {
  if (HIDE_NAV_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return "hidden";
  if (AUTH_NAV_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return "auth";
  return "full";
}

function isPathActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavTextLink({ href, label, onClick }: { href: string; label: string; onClick?: () => void }) {
  const pathname = usePathname() ?? "/";
  const isActive = isPathActive(pathname, href);

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      className={`rounded-md px-2 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}

export function AppShellNav({ user, isAdmin, logoUrl }: AppShellNavProps) {
  const pathname = usePathname() ?? "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const roleLinks: NavLink[] = [];
  if (user) roleLinks.push({ label: "Publisher Dashboard", href: "/my" });
  if (isAdmin) roleLinks.push({ label: "Admin", href: "/admin" });

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) return;

    let mounted = true;
    const loadUnread = async () => {
      try {
        const response = await fetch("/api/notifications/unread-count", { cache: "no-store" });
        if (!response.ok || !mounted) return;
        const data = (await response.json()) as { unread?: number };
        setUnread(typeof data.unread === "number" ? data.unread : 0);
      } catch {
        // no-op
      }
    };

    void loadUnread();
    window.addEventListener("notifications:unread-refresh", loadUnread);

    return () => {
      mounted = false;
      window.removeEventListener("notifications:unread-refresh", loadUnread);
    };
  }, [user]);

  const navMode = getShellNavMode(pathname);

  if (navMode === "hidden") return null;

  if (navMode === "auth") {
    return <AuthShellNav title={pathname === "/login" ? "Sign in" : "Invitation"} />;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 md:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">{logoUrl ? <img src={logoUrl} alt="ArtPulse" className="h-8 w-auto" /> : "ArtPulse"}</Link>

        <nav className="hidden flex-1 items-center justify-center gap-1 md:flex" aria-label="Primary">
          {PRIMARY_LINKS.map((item) => <NavTextLink key={item.href} href={item.href} label={item.label} />)}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {roleLinks.map((item) => <NavTextLink key={item.href} href={item.href} label={item.label} />)}

          <Link href="/search" className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Search">
            <Search className="h-4 w-4" />
          </Link>
          <Link href="/notifications" className="relative rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            {unread > 0 ? <span className="absolute right-1 top-1 inline-flex h-2 w-2 rounded-full bg-primary" aria-hidden="true" /> : null}
          </Link>
          <Link href="/account" className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account">
            <UserCircle className="h-4 w-4" />
          </Link>

          <button
            type="button"
            className="rounded-md p-2 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            aria-expanded={mobileOpen}
            aria-controls="app-shell-mobile-menu"
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            <span className="sr-only">Toggle navigation menu</span>
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <nav id="app-shell-mobile-menu" className="space-y-1 border-t border-border/80 px-4 py-3 md:hidden" aria-label="Mobile">
          {PRIMARY_LINKS.map((item) => <NavTextLink key={`mobile-${item.href}`} href={item.href} label={item.label} onClick={() => setMobileOpen(false)} />)}
          {roleLinks.map((item) => <NavTextLink key={`mobile-${item.href}`} href={item.href} label={item.label} onClick={() => setMobileOpen(false)} />)}
        </nav>
      ) : null}
    </header>
  );
}
