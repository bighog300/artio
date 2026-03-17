"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signIn } from "next-auth/react";

export function LoginButton({ callbackUrl = "/account", testAuthEnabled = false }: { callbackUrl?: string; testAuthEnabled?: boolean }) {
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  async function handleTestLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/test-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) throw new Error("Invalid test credentials");
      router.push("/for-you");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  if (testAuthEnabled) {
    return (
      <div className="space-y-3">
        {!showEmailLogin ? (
          <Button type="button" onClick={() => setShowEmailLogin(true)}>
            Continue with email
          </Button>
        ) : (
          <form className="space-y-3" onSubmit={handleTestLogin}>
            <label className="block text-sm" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="w-full rounded border p-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label className="block text-sm" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="w-full rounded border p-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <Button type="submit" disabled={isSubmitting}>
              Login
            </Button>
          </form>
        )}
      </div>
    );
  }

  return (
    <Button type="button" onClick={() => signIn("google", { callbackUrl })}>
      Continue with Google
    </Button>
  );
}
