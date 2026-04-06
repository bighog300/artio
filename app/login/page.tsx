import { LoginButton } from "@/app/login/login-button";
import { PageShell } from "@/components/ui/page-shell";
import { sanitizeNextPath } from "@/lib/login-next";

type LoginSearchParams = Promise<{ next?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: LoginSearchParams }) {
  const params = await searchParams;
  const next = sanitizeNextPath(params.next, "/account");
  const testAuthEnabled = process.env.NODE_ENV === "test";

  return (
    <PageShell>
      <div className="mx-auto max-w-sm space-y-8 py-12">
        <div className="space-y-2 text-center">
          <h1 className="type-h1">Artio</h1>
          <p className="type-caption">Discover art exhibitions, openings, and talks — all in one place.</p>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <p className="text-sm font-medium">Sign in to your account</p>
          <LoginButton callbackUrl={next} testAuthEnabled={testAuthEnabled} />
        </div>

        <ul className="space-y-2 text-center text-sm text-muted-foreground">
          <li>Save events and build your personal collection</li>
          <li>Follow venues and artists for a personalised feed</li>
          <li>Publish and manage your own venue or artist profile</li>
        </ul>
      </div>
    </PageShell>
  );
}
