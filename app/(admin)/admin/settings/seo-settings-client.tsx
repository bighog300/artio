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
  const [googleServiceAccountJson, setGoogleServiceAccountJson] = useState("");
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
        body: JSON.stringify({
          googleIndexingEnabled,
          googleServiceAccountJson: googleServiceAccountJson.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setErrorMessage(data.error?.message ?? "Save failed.");
        setStatus("error");
        return;
      }
      setStatus("saved");
      setGoogleServiceAccountJson("");
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
      setIndexingTestResult({
        ok: false,
        errorMessage: "Network error",
      });
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
        <input
          id="google-indexing-enabled"
          type="checkbox"
          checked={googleIndexingEnabled}
          onChange={(e) => {
            setGoogleIndexingEnabled(e.target.checked);
            setStatus("idle");
          }}
          disabled={saving}
        />
        Enable Google indexing API submissions
      </label>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="google-service-account-json">
          Google Service Account JSON
        </label>
        <textarea
          id="google-service-account-json"
          className="min-h-36 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={googleServiceAccountJson}
          onChange={(e) => {
            setGoogleServiceAccountJson(e.target.value);
            setStatus("idle");
          }}
          placeholder={props.initial.googleServiceAccountJsonSet ? '{ "type": "service_account", ... } (stored)' : '{ "type": "service_account", ... }'}
          disabled={saving}
          autoComplete="off"
        />

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            disabled={indexingTesting || !props.initial.googleServiceAccountJsonSet}
            onClick={() => void testGoogleIndexing()}
            className="rounded border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
          >
            {indexingTesting ? "Testing…" : "Test service account"}
          </button>
          {!props.initial.googleServiceAccountJsonSet && (
            <span className="text-xs text-muted-foreground">
              Save service account JSON first
            </span>
          )}
        </div>

        {indexingTestResult !== null ? (
          <div
            className={`mt-2 rounded border p-2 text-xs ${
              indexingTestResult.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {indexingTestResult.ok ? (
              <>
                <span className="font-medium">✓ Service account valid</span>
                {indexingTestResult.durationMs !== undefined ? ` · ${indexingTestResult.durationMs}ms` : ""}
                {indexingTestResult.clientEmail && (
                  <span className="ml-1 font-mono text-emerald-700">
                    · {indexingTestResult.clientEmail}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="font-medium">✗ Failed</span>
                {" · "}
                {indexingTestResult.errorMessage}
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>
      </div>

      {status === "saved" ? <div className="rounded border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-700">Settings saved.</div> : null}
      {status === "error" ? (
        <div className="flex items-center justify-between rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          <span>{errorMessage ?? "An error occurred."}</span>
          <button type="button" onClick={() => setStatus("idle")}>×</button>
        </div>
      ) : null}
    </section>
  );
}
