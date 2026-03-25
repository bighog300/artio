"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AcceptInviteButton({ token }: { token: string }) {
  const { status, update } = useSession();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleAccept = async () => {
    setState("loading");
    setMessage(null);

    try {
      const response = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not accept invite");

      setState("success");
      setMessage(
        `Invite accepted. Your role is now ${body.role}. ` +
        "If you don't see your new permissions, sign out and back in."
      );
      await update();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not accept invite");
    }
  };

  if (status !== "authenticated") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Sign in with the invited email address to accept this invite.</p>
        <Button asChild>
          <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in to accept invite</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button type="button" disabled={state === "loading" || state === "success"} onClick={() => void handleAccept()}>
        {state === "loading" ? "Accepting…" : "Accept invite"}
      </Button>
      {message ? <p className={state === "success" ? "text-sm text-green-700" : "text-sm text-red-700"}>{message}</p> : null}
    </div>
  );
}
