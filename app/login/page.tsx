import { LoginButton } from "@/app/login/login-button";
import { sanitizeNextPath } from "@/lib/login-next";

type LoginSearchParams = Promise<{ next?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: LoginSearchParams }) {
  const params = await searchParams;
  const next = sanitizeNextPath(params.next, "/account");
  const testAuthEnabled = process.env.NODE_ENV === "test";

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Login</h1>
      <p className="text-sm text-muted-foreground">Sign in to save favorites and manage account.</p>
      <LoginButton callbackUrl={next} testAuthEnabled={testAuthEnabled} />
    </main>
  );
}
