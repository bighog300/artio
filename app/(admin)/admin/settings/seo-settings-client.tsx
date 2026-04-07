"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type SeoSettingsProps = {
  initial: {
    googleIndexingEnabled: boolean;
    googleServiceAccountJsonSet: boolean;
  };
};

type GoogleIndexingTestResult = {
  ok: boolean;
  durationMs?: number;
  clientEmail?: string;
  errorMessage?: string;
  keyConfigured?: boolean;
};

export default function SeoSettingsClient(props: SeoSettingsProps) {
  const [googleIndexingEnabled, setGoogleIndexingEnabled] = useState(Boolean(props.initial.googleIndexingEnabled));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [indexingTestResult, setIndexingTestResult] = useState<GoogleIndexingTestResult | null>(null);
  const [indexingTesting, setIndexingTesting] = useState(false);

  async function save() {
    setSaving(true);
    setStatus("idle");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleIndexingEnabled }),
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

  async function testGoogleIndexing() {
    setIndexingTesting(true);
    setIndexingTestResult(null);
    try {
      const res = await fetch("/api/admin/google-indexing-test");
      const data = (await res.json()) as GoogleIndexingTestResult;
      setIndexingTestResult(data);
    } catch {
      setIndexingTestResult({ ok: false, errorMessage: "Network error" });
    } finally {
      setIndexingTesting(false);
    }
  }

  return (
    <section className="rounded-lg border bg-background p-4 space-y-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">SEO &amp; Syndication</h2>
        <p className="text-sm text-muted-foreground">Configure Google Event indexing for published event URLs.</p>
      </div>

      <label className="flex items-center gap-2 text-sm" htmlFor="google-indexing-enabled">
        <input id="google-indexing-enabled" type="checkbox" checked={googleIndexingEnabled} onChange={(e) => {
          setGoogleIndexingEnabled(e.target.checked);
          setStatus("idle");
        }} disabled={saving} />
        Enable Google indexing API submissions
      </label>

      <div className="space-y-2">
        <button type="button" disabled={indexingTesting || !props.initial.googleServiceAccountJsonSet} onClick={() => void testGoogleIndexing()} className="rounded border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50">
          {indexingTesting ? "Testing…" : "Test service account"}
        </button>
        {!props.initial.googleServiceAccountJsonSet && <p className="text-xs text-muted-foreground">Configure in Configuration tab.</p>}
        {indexingTestResult !== null ? (
          <div className={`mt-2 rounded border p-2 text-xs ${indexingTestResult.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
            {indexingTestResult.ok ? `✓ Service account valid${indexingTestResult.durationMs !== undefined ? ` · ${indexingTestResult.durationMs}ms` : ""}` : `✗ Failed · ${indexingTestResult.errorMessage}`}
          </div>
        ) : null}
      </div>

      <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>

      {status === "saved" ? <div className="rounded border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-700">Settings saved.</div> : null}
      {status === "error" ? <div className="flex items-center justify-between rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700"><span>{errorMessage ?? "An error occurred."}</span><button type="button" onClick={() => setStatus("idle")}>×</button></div> : null}
    </section>
  );
}
