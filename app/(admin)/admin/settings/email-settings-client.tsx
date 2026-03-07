"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type EmailSettingsProps = {
  initial: {
    emailEnabled: boolean;
    emailFromAddress: string | null;
    resendApiKey: string | null;
    resendFromAddress: string | null;
    emailOutboxBatchSize: number | null;
  };
};

export default function EmailSettingsClient(props: EmailSettingsProps) {
  const [enabled, setEnabled] = useState(props.initial.emailEnabled);
  const [resendApiKey, setResendApiKey] = useState(props.initial.resendApiKey ?? "");
  const [fromAddress, setFromAddress] = useState(props.initial.resendFromAddress ?? "");
  const [batchSize, setBatchSize] = useState(
    props.initial.emailOutboxBatchSize !== null ? String(props.initial.emailOutboxBatchSize) : "",
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setStatus("idle");
    setErrorMessage(null);
    try {
      const parsedBatchSize = batchSize.trim() ? Number.parseInt(batchSize.trim(), 10) : null;
      const body = {
        emailEnabled: enabled,
        resendApiKey: resendApiKey.trim() || null,
        resendFromAddress: fromAddress.trim() || null,
        emailOutboxBatchSize:
          Number.isFinite(parsedBatchSize) && parsedBatchSize! >= 1 && parsedBatchSize! <= 100 ? parsedBatchSize : null,
      };
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setErrorMessage(data.error?.message ?? "Save failed.");
        setStatus("error");
        return;
      }
      setStatus("saved");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    setStatus("idle");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEnabled: false,
          emailFromAddress: null,
          resendApiKey: null,
          resendFromAddress: null,
          emailOutboxBatchSize: null,
        }),
      });
      if (!res.ok) {
        setStatus("error");
        setErrorMessage("Reset failed.");
        return;
      }
      setEnabled(false);
      setResendApiKey("");
      setFromAddress("");
      setBatchSize("");
      setStatus("saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border bg-background p-4 space-y-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Email delivery</h2>
        <p className="text-sm text-muted-foreground">
          Configure global email sending behaviour for outbox processing and campaigns.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm font-medium" htmlFor="email-enabled">
          <input
            id="email-enabled"
            type="checkbox"
            className="h-4 w-4"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setStatus("idle");
            }}
            disabled={saving}
          />
          Enable email sending
        </label>
        <p className="text-xs text-muted-foreground">
          When disabled, the outbox cron exits without sending notifications.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="resend-api-key">
          Resend API Key
        </label>
        <p className="text-xs text-muted-foreground">
          API key used to authenticate with Resend for outbound delivery.
        </p>
        <input
          id="resend-api-key"
          type="password"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={resendApiKey}
          onChange={(e) => {
            setResendApiKey(e.target.value);
            setStatus("idle");
          }}
          placeholder={props.initial.resendApiKey ? "•••••••• (stored)" : "re_..."}
          disabled={saving}
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="resend-from-address">
          From Address
        </label>
        <p className="text-xs text-muted-foreground">
          Sender address used for delivery.
        </p>
        <input
          id="resend-from-address"
          type="text"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={fromAddress}
          onChange={(e) => {
            setFromAddress(e.target.value);
            setStatus("idle");
          }}
          placeholder="Artpulse <noreply@mail.artpulse.co>"
          disabled={saving}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="email-outbox-batch-size">
          Outbox batch size override
        </label>
        <p className="text-xs text-muted-foreground">
          Notifications processed per run. Leave blank to use the default (25).
        </p>
        <input
          id="email-outbox-batch-size"
          type="number"
          min={1}
          max={100}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={batchSize}
          onChange={(e) => {
            setBatchSize(e.target.value);
            setStatus("idle");
          }}
          placeholder="25"
          disabled={saving}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Need delivery diagnostics?{" "}
        <Link className="underline" href="/admin/ops/email">
          Open outbox monitoring
        </Link>
        .
      </p>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
        <Button variant="outline" onClick={reset} disabled={saving}>
          Reset to defaults
        </Button>
      </div>

      {status === "saved" ? (
        <div className="rounded border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-700">
          Settings saved.
        </div>
      ) : null}
      {status === "error" ? (
        <div className="flex items-center justify-between rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          <span>{errorMessage ?? "An error occurred."}</span>
          <button type="button" onClick={() => setStatus("idle")}>
            ×
          </button>
        </div>
      ) : null}
    </section>
  );
}
