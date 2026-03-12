import type { Metadata } from 'next';
import './globals.css';
import { MobileBottomNav } from '@/components/navigation/mobile-bottom-nav';
import { ToastViewport } from '@/components/ui/toast';
import { getSessionUser } from '@/lib/auth';
import { CommandPalette } from '@/components/command-palette/command-palette';
import { AppShell } from '@/components/shell/app-shell';
import { isAdminEmail } from '@/lib/admin';
import { Providers } from './providers';
import { getPublicBranding } from '@/lib/site-settings/get-public-branding';


// Root layout reads NextAuth session on every request; keep Node runtime to avoid
// Edge/Node auth cookie parsing drift that can cause login redirect loops.
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: { default: 'Artio', template: '%s | Artio' },
  description: 'Discover art exhibitions, openings, talks, workshops, and fairs.',
  openGraph: { title: 'Artio', description: 'Discover art events near you.', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Artio', description: 'Discover art events near you.' },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  const isAdmin = isAdminEmail(user?.email);
  const branding = await getPublicBranding();

  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground">
        <Providers>
          <a
            href="#main"
            className="sr-only z-50 m-2 inline-block rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:absolute focus:left-2 focus:top-2"
          >
            Skip to content
          </a>
          <AppShell user={user} isAdmin={isAdmin} logoUrl={branding.logoUrl}>{children}</AppShell>
          <ToastViewport />
          <MobileBottomNav isAuthenticated={Boolean(user)} />
          <CommandPalette isAuthenticated={Boolean(user)} isAdmin={isAdmin} />
        </Providers>
      </body>
    </html>
  );
}
