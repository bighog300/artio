export type NavItem = {
  label: string;
  href: string;
  authRequired?: boolean;
};

const PUBLIC_ITEMS: NavItem[] = [
  { label: "Events", href: "/events" },
  { label: "Venues", href: "/venues" },
  { label: "Artists", href: "/artists" },
  { label: "Artwork", href: "/artwork" },
  { label: "Calendar", href: "/calendar" },
  { label: "Nearby", href: "/nearby" },
  { label: "Search", href: "/search" },
];

const AUTH_ITEMS: NavItem[] = [
  { label: "For You", href: "/for-you", authRequired: true },
  { label: "Following", href: "/following", authRequired: true },
  { label: "Saved", href: "/saved", authRequired: true },
  { label: "Saved Searches", href: "/saved-searches", authRequired: true },
  { label: "Notifications", href: "/notifications", authRequired: true },
  { label: "Account", href: "/account", authRequired: true },
];

export function getNavItems(isAuthenticated: boolean) {
  return isAuthenticated ? [...PUBLIC_ITEMS, ...AUTH_ITEMS] : PUBLIC_ITEMS;
}
