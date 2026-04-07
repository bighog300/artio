"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { enqueueToast } from "@/lib/toast";

type ConfigurationProps = {
  initial: {
    openAiApiKeySet: boolean;
    geminiApiKeySet: boolean;
    anthropicApiKeySet: boolean;
    googlePseApiKeySet: boolean;
    googlePseCx: string | null;
    braveSearchApiKeySet: boolean;
    resendApiKeySet: boolean;
    stripePublishableKey: string | null;
    stripeSecretKeySet: boolean;
    stripeWebhookSecretSet: boolean;
    googleServiceAccountJsonSet: boolean;
    envFallbacks: {
      OPENAI_API_KEY: boolean;
      GEMINI_API_KEY: boolean;
      ANTHROPIC_API_KEY: boolean;
      GOOGLE_PSE_API_KEY: boolean;
      GOOGLE_PSE_CX: boolean;
      BRAVE_SEARCH_API_KEY: boolean;
      RESEND_API_KEY: boolean;
      STRIPE_SECRET_KEY: boolean;
      STRIPE_PUBLISHABLE_KEY: boolean;
      STRIPE_WEBHOOK_SECRET: boolean;
      GOOGLE_SERVICE_ACCOUNT_JSON: boolean;
    };
  };
};

type Status = "idle" | "saved" | "error";

type TestResult = { ok: boolean; durationMs?: number; errorMessage?: string; resultsCount?: number; model?: string; mode?: string; clientEmail?: string };

export default function ConfigurationClient({ initial }: ConfigurationProps) {
  const [keySet, setKeySet] = useState({
    openAiApiKeySet: initial.openAiApiKeySet,
    geminiApiKeySet: initial.geminiApiKeySet,
    anthropicApiKeySet: initial.anthropicApiKeySet,
    googlePseApiKeySet: initial.googlePseApiKeySet,
    braveSearchApiKeySet: initial.braveSearchApiKeySet,
    resendApiKeySet: initial.resendApiKeySet,
    stripeSecretKeySet: initial.stripeSecretKeySet,
    stripeWebhookSecretSet: initial.stripeWebhookSecretSet,
    googleServiceAccountJsonSet: initial.googleServiceAccountJsonSet,
  });
  const [fields, setFields] = useState({ googlePseCx: initial.googlePseCx ?? "", stripePublishableKey: initial.stripePublishableKey ?? "" });
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [errorMessage, setErrorMessage] = useState<Record<string, string>>({});
  const [tests, setTests] = useState<Record<string, TestResult | null>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: string[]; alreadySet: string[]; notFound: string[] } | null>(null);
  const [importPayload, setImportPayload] = useState<unknown>(null);
  const [importPreview, setImportPreview] = useState<{ willChange: Array<{ field: string; from: string; to: string }>; unchanged: string[] } | null>(null);

  const setStatusIdle = (group: string) => setStatus((prev) => ({ ...prev, [group]: "idle" }));

  async function saveGroup(group: string, body: Record<string, unknown>) {
    setSaving((p) => ({ ...p, [group]: true }));
    setStatusIdle(group);
    try {
      const res = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMessage((p) => ({ ...p, [group]: data?.error?.message ?? "Save failed." }));
        setStatus((p) => ({ ...p, [group]: "error" }));
        return;
      }
      const settings = data?.settings ?? {};
      setKeySet((p) => ({
        ...p,
        openAiApiKeySet: settings.openAiApiKeySet ?? p.openAiApiKeySet,
        geminiApiKeySet: settings.geminiApiKeySet ?? p.geminiApiKeySet,
        anthropicApiKeySet: settings.anthropicApiKeySet ?? p.anthropicApiKeySet,
        googlePseApiKeySet: settings.googlePseApiKeySet ?? p.googlePseApiKeySet,
        braveSearchApiKeySet: settings.braveSearchApiKeySet ?? p.braveSearchApiKeySet,
        resendApiKeySet: settings.resendApiKeySet ?? p.resendApiKeySet,
        stripeSecretKeySet: settings.stripeSecretKeySet ?? p.stripeSecretKeySet,
        stripeWebhookSecretSet: settings.stripeWebhookSecretSet ?? p.stripeWebhookSecretSet,
        googleServiceAccountJsonSet: settings.googleServiceAccountJsonSet ?? p.googleServiceAccountJsonSet,
      }));
      setVisible({});
      setInputs({});
      setStatus((p) => ({ ...p, [group]: "saved" }));
    } catch {
      setErrorMessage((p) => ({ ...p, [group]: "Save failed." }));
      setStatus((p) => ({ ...p, [group]: "error" }));
      enqueueToast({ title: "Failed to save settings", variant: "error" });
    } finally {
      setSaving((p) => ({ ...p, [group]: false }));
    }
  }

  async function runTest(key: string, url: string) {
    setTesting((p) => ({ ...p, [key]: true }));
    setTests((p) => ({ ...p, [key]: null }));
    try {
      const res = await fetch(url);
      const data = await res.json() as TestResult;
      setTests((p) => ({ ...p, [key]: data }));
    } catch {
      setTests((p) => ({ ...p, [key]: { ok: false, errorMessage: "Network error" } }));
    } finally {
      setTesting((p) => ({ ...p, [key]: false }));
    }
  }

  async function handleFileSelect(file?: File) {
    if (!file) return;
    const text = await file.text();
    try {
      const payload = JSON.parse(text);
      setImportPayload(payload);
      const res = await fetch("/api/admin/settings/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Import preview failed");
      setImportPreview({ willChange: data.willChange ?? [], unchanged: data.unchanged ?? [] });
    } catch (error) {
      enqueueToast({ title: "Import preview failed", message: error instanceof Error ? error.message : String(error), variant: "error" });
    }
  }

  async function applyImport() {
    if (!importPayload) return;
    const res = await fetch("/api/admin/settings/import?apply=true", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(importPayload) });
    const data = await res.json();
    if (!res.ok) {
      enqueueToast({ title: "Import failed", variant: "error" });
      return;
    }
    enqueueToast({ title: `${data.applied ?? 0} settings updated`, variant: "success" });
    setTimeout(() => window.location.reload(), 1500);
  }

  async function handleSyncFromEnv() {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/settings/sync-from-env", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Sync failed");
      setSyncResult(data);
      if ((data.synced?.length ?? 0) > 0) setTimeout(() => window.location.reload(), 1500);
    } catch {
      enqueueToast({ title: "Sync from env failed", variant: "error" });
    } finally {
      setSyncing(false);
    }
  }

  const fromEnv = (dbSet: boolean, envSet: boolean) => !dbSet && envSet;

  return <div className="space-y-4">
    <div className="flex justify-end">
      <a
        href="/admin/settings/log"
        className="text-xs text-muted-foreground underline hover:text-foreground"
      >
        View change log →
      </a>
    </div>
    <section className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between"><h3 className="font-semibold">AI providers</h3><Button onClick={() => void saveGroup("ai", { openAiApiKey: visible.openAi ? (inputs.openAi?.trim() || null) : undefined, geminiApiKey: visible.gemini ? (inputs.gemini?.trim() || null) : undefined, anthropicApiKey: visible.anthropic ? (inputs.anthropic?.trim() || null) : undefined })} disabled={saving.ai}>{saving.ai ? "Saving…" : "Save"}</Button></div>
      {[["OpenAI API key","openAi","openAiApiKeySet","OPENAI_API_KEY"],["Gemini API key","gemini","geminiApiKeySet","GEMINI_API_KEY"],["Anthropic API key","anthropic","anthropicApiKeySet","ANTHROPIC_API_KEY"]].map(([label,key,flag,env]) => {
        const isSet = keySet[flag as keyof typeof keySet] as boolean;
        return <div key={key as string} className="text-sm"><div>{label}</div><div className="text-xs text-muted-foreground">{isSet ? "Key stored" : "Not set"} {fromEnv(isSet, initial.envFallbacks[env as keyof typeof initial.envFallbacks]) && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-800">From env</span>} <button type="button" className="ml-2 underline" onClick={() => setVisible((p) => ({ ...p, [key as string]: true }))}>{isSet ? "Clear then set" : "Set key"}</button></div>{visible[key as string] && <input type="password" className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={inputs[key as string] ?? ""} onChange={(e) => setInputs((p) => ({ ...p, [key as string]: e.target.value }))} />}</div>;
      })}
      <div className="flex flex-wrap gap-2">{(keySet.openAiApiKeySet || initial.envFallbacks.OPENAI_API_KEY) && <button className="rounded border px-3 py-1 text-xs" onClick={() => void runTest("openai", "/api/admin/ai-test?provider=openai")} disabled={testing.openai}>{testing.openai ? "Testing…" : "Test OpenAI"}</button>}{(keySet.geminiApiKeySet || initial.envFallbacks.GEMINI_API_KEY) && <button className="rounded border px-3 py-1 text-xs" onClick={() => void runTest("gemini", "/api/admin/ai-test?provider=gemini")} disabled={testing.gemini}>{testing.gemini ? "Testing…" : "Test Gemini"}</button>}{(keySet.anthropicApiKeySet || initial.envFallbacks.ANTHROPIC_API_KEY) && <button className="rounded border px-3 py-1 text-xs" onClick={() => void runTest("claude", "/api/admin/ai-test?provider=claude")} disabled={testing.claude}>{testing.claude ? "Testing…" : "Test Anthropic"}</button>}</div>
      {tests.openai && <p className="text-xs">{tests.openai.ok ? "✓ Connected" : `✗ ${tests.openai.errorMessage}`}</p>}
      {tests.gemini && <p className="text-xs">{tests.gemini.ok ? "✓ Connected" : `✗ ${tests.gemini.errorMessage}`}</p>}
      {tests.claude && <p className="text-xs">{tests.claude.ok ? "✓ Connected" : `✗ ${tests.claude.errorMessage}`}</p>}
      {status.ai === "saved" && <div className="rounded border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-700">Settings saved.</div>}
      {status.ai === "error" && <div className="flex items-center justify-between rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700"><span>{errorMessage.ai}</span><button onClick={() => setStatusIdle("ai")}>×</button></div>}
    </section>

    <section className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between"><h3 className="font-semibold">Search APIs</h3><Button onClick={() => void saveGroup("search", { googlePseApiKey: visible.googlePseApiKey ? (inputs.googlePseApiKey?.trim() || null) : undefined, braveSearchApiKey: visible.braveSearchApiKey ? (inputs.braveSearchApiKey?.trim() || null) : undefined, googlePseCx: visible.googlePseCx ? (inputs.googlePseCx?.trim() || null) : undefined })} disabled={saving.search}>{saving.search ? "Saving…" : "Save"}</Button></div>
      <div className="text-sm">Google PSE API key<div className="text-xs text-muted-foreground">{keySet.googlePseApiKeySet ? "Key stored" : "Not set"} {fromEnv(keySet.googlePseApiKeySet, initial.envFallbacks.GOOGLE_PSE_API_KEY) && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-800">From env</span>} <button className="ml-2 underline" onClick={() => setVisible((p) => ({ ...p, googlePseApiKey: true }))}>Set key</button></div>{visible.googlePseApiKey && <input type="password" className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={inputs.googlePseApiKey ?? ""} onChange={(e) => setInputs((p) => ({ ...p, googlePseApiKey: e.target.value }))} />}</div>
      <div className="text-sm">Google PSE CX<div className="text-xs text-muted-foreground">{fields.googlePseCx || "Not set"} {fromEnv(Boolean(fields.googlePseCx), initial.envFallbacks.GOOGLE_PSE_CX) && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-800">From env</span>} <button className="ml-2 underline" onClick={() => { setVisible((p) => ({ ...p, googlePseCx: true })); setInputs((p) => ({ ...p, googlePseCx: fields.googlePseCx })); }}>Edit</button></div>{visible.googlePseCx && <input type="text" className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={inputs.googlePseCx ?? ""} onChange={(e) => { const v=e.target.value; setInputs((p) => ({ ...p, googlePseCx: v })); setFields((p)=>({ ...p, googlePseCx: v })); }} />}</div>
      <div className="text-sm">Brave Search API key<div className="text-xs text-muted-foreground">{keySet.braveSearchApiKeySet ? "Key stored" : "Not set"} {fromEnv(keySet.braveSearchApiKeySet, initial.envFallbacks.BRAVE_SEARCH_API_KEY) && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-800">From env</span>} <button className="ml-2 underline" onClick={() => setVisible((p) => ({ ...p, braveSearchApiKey: true }))}>Set key</button></div>{visible.braveSearchApiKey && <input type="password" className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={inputs.braveSearchApiKey ?? ""} onChange={(e) => setInputs((p) => ({ ...p, braveSearchApiKey: e.target.value }))} />}</div>
      <div className="flex gap-2">{(keySet.googlePseApiKeySet || initial.envFallbacks.GOOGLE_PSE_API_KEY) && (fields.googlePseCx || initial.envFallbacks.GOOGLE_PSE_CX) && <button className="rounded border px-3 py-1 text-xs" onClick={() => void runTest("google_pse", "/api/admin/ingest/search-test?provider=google_pse&query=contemporary+art+gallery&maxResults=3")}>Test Google PSE</button>}{(keySet.braveSearchApiKeySet || initial.envFallbacks.BRAVE_SEARCH_API_KEY) && <button className="rounded border px-3 py-1 text-xs" onClick={() => void runTest("brave", "/api/admin/ingest/search-test?provider=brave&query=contemporary+art+gallery&maxResults=3")}>Test Brave</button>}</div>
      {tests.google_pse && <p className="text-xs">{tests.google_pse.ok ? "✓ Connected" : `✗ ${tests.google_pse.errorMessage}`}</p>}
      {tests.brave && <p className="text-xs">{tests.brave.ok ? "✓ Connected" : `✗ ${tests.brave.errorMessage}`}</p>}
    </section>

    <section className="rounded-lg border p-4 space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Email</h3><Button onClick={() => void saveGroup("email", { resendApiKey: visible.resend ? (inputs.resend?.trim() || null) : undefined })}>Save</Button></div><div className="text-sm">Resend API key<div className="text-xs text-muted-foreground">{keySet.resendApiKeySet ? "Key stored" : "Not set"} {fromEnv(keySet.resendApiKeySet, initial.envFallbacks.RESEND_API_KEY) && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-800">From env</span>} <button className="ml-2 underline" onClick={() => setVisible((p) => ({ ...p, resend: true }))}>Set key</button></div>{visible.resend && <input type="password" className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={inputs.resend ?? ""} onChange={(e) => setInputs((p) => ({ ...p, resend: e.target.value }))} />}</div></section>

    <section className="rounded-lg border p-4 space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Payments</h3><Button onClick={() => void saveGroup("payments", { stripePublishableKey: visible.stripePublishableKey ? (inputs.stripePublishableKey?.trim() || null) : undefined, stripeSecretKey: visible.stripeSecretKey ? (inputs.stripeSecretKey?.trim() || null) : undefined, stripeWebhookSecret: visible.stripeWebhookSecret ? (inputs.stripeWebhookSecret?.trim() || null) : undefined })}>Save</Button></div><div className="text-sm">Stripe publishable key<div className="text-xs text-muted-foreground">{fields.stripePublishableKey || "Not set"} <button className="ml-2 underline" onClick={() => { setVisible((p) => ({ ...p, stripePublishableKey: true })); setInputs((p) => ({ ...p, stripePublishableKey: fields.stripePublishableKey })); }}>Edit</button></div>{visible.stripePublishableKey && <input type="text" className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={inputs.stripePublishableKey ?? ""} onChange={(e) => { const v=e.target.value; setInputs((p) => ({ ...p, stripePublishableKey: v })); setFields((p)=>({ ...p, stripePublishableKey: v })); }} />}</div><div className="text-sm">Stripe secret key<div className="text-xs text-muted-foreground">{keySet.stripeSecretKeySet ? "Key stored" : "Not set"} {fromEnv(keySet.stripeSecretKeySet, initial.envFallbacks.STRIPE_SECRET_KEY) && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-800">From env</span>} <button className="ml-2 underline" onClick={() => setVisible((p) => ({ ...p, stripeSecretKey: true }))}>Set key</button></div>{visible.stripeSecretKey && <input type="password" className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={inputs.stripeSecretKey ?? ""} onChange={(e) => setInputs((p) => ({ ...p, stripeSecretKey: e.target.value }))} />}</div><div className="text-sm">Stripe webhook secret<div className="text-xs text-muted-foreground">{keySet.stripeWebhookSecretSet ? "Key stored" : "Not set"} {fromEnv(keySet.stripeWebhookSecretSet, initial.envFallbacks.STRIPE_WEBHOOK_SECRET) && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-800">From env</span>} <button className="ml-2 underline" onClick={() => setVisible((p) => ({ ...p, stripeWebhookSecret: true }))}>Set key</button></div>{visible.stripeWebhookSecret && <input type="password" className="mt-1 w-full rounded-md border px-3 py-2 text-sm" value={inputs.stripeWebhookSecret ?? ""} onChange={(e) => setInputs((p) => ({ ...p, stripeWebhookSecret: e.target.value }))} />}</div>{(keySet.stripeSecretKeySet || initial.envFallbacks.STRIPE_SECRET_KEY) && <button className="rounded border px-3 py-1 text-xs" onClick={() => void runTest("stripe", "/api/admin/stripe-test")}>{testing.stripe ? "Testing…" : "Test Stripe"}</button>}{tests.stripe && <p className="text-xs">{tests.stripe.ok ? "✓ Connected" : `✗ ${tests.stripe.errorMessage}`}</p>}</section>

    <section className="rounded-lg border p-4 space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">SEO / Indexing</h3><Button onClick={() => void saveGroup("seo", { googleServiceAccountJson: visible.googleServiceAccountJson ? (inputs.googleServiceAccountJson?.trim() || null) : undefined })}>Save</Button></div><div className="text-sm">Google service account<div className="text-xs text-muted-foreground">{keySet.googleServiceAccountJsonSet ? "Key stored" : "Not set"} {fromEnv(keySet.googleServiceAccountJsonSet, initial.envFallbacks.GOOGLE_SERVICE_ACCOUNT_JSON) && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-amber-800">From env</span>} <button className="ml-2 underline" onClick={() => setVisible((p) => ({ ...p, googleServiceAccountJson: true }))}>Set key</button></div>{visible.googleServiceAccountJson && <textarea className="mt-1 min-h-28 w-full rounded-md border px-3 py-2 text-sm" value={inputs.googleServiceAccountJson ?? ""} onChange={(e) => setInputs((p) => ({ ...p, googleServiceAccountJson: e.target.value }))} />}</div>{(keySet.googleServiceAccountJsonSet || initial.envFallbacks.GOOGLE_SERVICE_ACCOUNT_JSON) && <button className="rounded border px-3 py-1 text-xs" onClick={() => void runTest("googleIndexing", "/api/admin/google-indexing-test")}>Test Google Indexing</button>}{tests.googleIndexing && <p className="text-xs">{tests.googleIndexing.ok ? "✓ Connected" : `✗ ${tests.googleIndexing.errorMessage}`}</p>}</section>

    <section className="rounded-lg border p-4 space-y-2"><h3 className="font-semibold">Export settings</h3><p className="text-sm text-muted-foreground">Downloads all non-secret settings as a JSON file. API keys are never included.</p><button className="rounded border px-3 py-2 text-sm" onClick={() => { window.location.href = "/api/admin/settings/export"; }}>Download settings export</button></section>

    <section className="rounded-lg border p-4 space-y-2"><h3 className="font-semibold">Import settings</h3><input type="file" accept=".json" onChange={(e) => void handleFileSelect(e.target.files?.[0])} />{importPreview && <div className="text-sm space-y-1"><p>{importPreview.willChange.length} fields will change, {importPreview.unchanged.length} unchanged</p><ul className="list-disc pl-5">{importPreview.willChange.map((item) => <li key={item.field}>{item.field}: {item.from} → {item.to}</li>)}</ul><button className="rounded border px-3 py-2 text-sm" onClick={() => void applyImport()}>Apply import</button></div>}</section>

    <section className="rounded-lg border p-4 space-y-2"><h3 className="font-semibold">Sync from environment</h3><p className="text-sm text-muted-foreground">Reads environment variables and writes them to the database for any fields that are not yet set. Never overwrites existing values.</p><button className="rounded border px-3 py-2 text-sm" onClick={() => void handleSyncFromEnv()} disabled={syncing}>{syncing ? "Syncing…" : "Sync from environment"}</button>{syncResult && <div className="text-sm"><p>{syncResult.synced.length} fields synced: {syncResult.synced.join(", ") || "none"}</p><p>{syncResult.alreadySet.length} already set (not changed)</p>{syncResult.notFound.length > 0 && <p>{syncResult.notFound.length} not found in env: {syncResult.notFound.join(", ")}</p>}</div>}</section>
  </div>;
}
