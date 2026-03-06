"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  outboxId?: string;
};

export function OutboxActionsClient({ outboxId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function triggerSend() {
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/outbox/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to trigger send");
      setMessage(`Triggered send: processed ${Number(body?.processed ?? 0)} row(s).`);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger send");
    }
  }

  async function retryFailed() {
    if (!outboxId) return;
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/outbox/${outboxId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "PENDING" }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to retry outbox row");
      setMessage("Outbox row reset to PENDING.");
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry outbox row");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={triggerSend}
        disabled={isPending}
        className="rounded border px-3 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        Trigger Send
      </button>
      {outboxId ? (
        <button
          type="button"
          onClick={retryFailed}
          disabled={isPending}
          className="rounded border px-3 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          Retry
        </button>
      ) : null}
      {message ? <span className="text-xs text-green-700">{message}</span> : null}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
