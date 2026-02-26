import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/auth";
import { AppShellNav } from "@/components/shell/app-shell-nav";

type AppShellProps = {
  user: SessionUser | null;
  isAdmin: boolean;
  logoUrl: string | null;
  children: ReactNode;
};

export function AppShell({ user, isAdmin, logoUrl, children }: AppShellProps) {
  return (
    <>
      <AppShellNav user={user} isAdmin={isAdmin} logoUrl={logoUrl} />
      <main id="main" className="pb-20 md:pb-0">
        {children}
      </main>
    </>
  );
}
