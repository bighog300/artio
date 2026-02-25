"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { enqueueToast } from "@/lib/toast";

export function MyArchiveActionButton({ entityLabel, endpointBase, archived }: { entityLabel: string; endpointBase: string; archived: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    const action = archived ? "restore" : "archive";
    const confirmed = window.confirm(archived ? `Restore this ${entityLabel}?` : `Archive this ${entityLabel}? You can restore it later.`);
    if (!confirmed) return;
    setBusy(true);
    const res = await fetch(`${endpointBase}/${action}`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      enqueueToast({ title: body?.message ?? body?.error ?? `Failed to ${action} ${entityLabel}`, variant: "error" });
      setBusy(false);
      return;
    }
    enqueueToast({ title: archived ? `${entityLabel} restored` : `${entityLabel} archived`, variant: "success" });
    router.refresh();
    setBusy(false);
  }

  return (
    <button type="button" className="underline disabled:opacity-60" onClick={() => void run()} disabled={busy}>
      {busy ? "Working..." : archived ? "Restore" : "Archive"}
    </button>
  );
}
