"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmailSettingsClient from "./email-settings-client";
import IngestSettingsClient from "./ingest-settings-client";
import PaymentsSettingsClient from "./payments-settings-client";
import SeoSettingsClient from "./seo-settings-client";
import CronSettingsClient from "./cron-settings-client";

const TABS = ["general", "email", "ingest-ai", "payments", "notifications", "seo", "ops", "cron"] as const;
type TabKey = (typeof TABS)[number];

function isTab(value: string | null): value is TabKey { return !!value && (TABS as readonly string[]).includes(value); }

export default function SettingsShell({ initial }: { initial: Record<string, unknown> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = isTab(searchParams.get("tab")) ? (searchParams.get("tab") as TabKey) : "general";

  const setTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const emailInitial = useMemo(() => ({
    emailEnabled: Boolean(initial.emailEnabled),
    emailFromAddress: (initial.emailFromAddress as string | null) ?? null,
    resendApiKey: (initial.resendApiKey as string | null) ?? null,
    resendFromAddress: (initial.resendFromAddress as string | null) ?? null,
    emailOutboxBatchSize: (initial.emailOutboxBatchSize as number | null) ?? null,
  }), [initial]);

  return (
    <Tabs value={active} onValueChange={setTab} className="grid grid-cols-[200px_1fr] gap-6">
      <TabsList className="h-auto flex-col items-stretch justify-start bg-transparent p-0">
        <TabsTrigger className="justify-start" value="general">General</TabsTrigger>
        <TabsTrigger className="justify-start" value="email">Email</TabsTrigger>
        <TabsTrigger className="justify-start" value="ingest-ai">Ingest &amp; AI</TabsTrigger>
        <TabsTrigger className="justify-start" value="payments">Payments</TabsTrigger>
        <TabsTrigger className="justify-start" value="notifications">Notifications</TabsTrigger>
        <TabsTrigger className="justify-start" value="seo">SEO</TabsTrigger>
        <TabsTrigger className="justify-start" value="ops">Ops</TabsTrigger>
        <TabsTrigger className="justify-start" value="cron">Scheduled Jobs</TabsTrigger>
      </TabsList>

      <div>
        <TabsContent value="general"><GeneralSettings initial={initial} /></TabsContent>
        <TabsContent value="email"><EmailSettingsClient initial={emailInitial} /></TabsContent>
        <TabsContent value="ingest-ai"><IngestSettingsClient initial={{
          ingestSystemPrompt: (initial.ingestSystemPrompt as string | null) ?? null,
          ingestModel: (initial.ingestModel as string | null) ?? null,
          ingestMaxOutputTokens: (initial.ingestMaxOutputTokens as number | null) ?? null,
          openAiApiKeySet: Boolean(initial.openAiApiKeySet),
          ingestEnabled: Boolean(initial.ingestEnabled),
          ingestImageEnabled: Boolean(initial.ingestImageEnabled),
          venueAutoPublish: Boolean(initial.venueAutoPublish),
          venueGenerationModel: (initial.venueGenerationModel as string | null) ?? null,
          ingestMaxCandidatesPerVenueRun: (initial.ingestMaxCandidatesPerVenueRun as number | null) ?? null,
          ingestDuplicateSimilarityThreshold: (initial.ingestDuplicateSimilarityThreshold as number | null) ?? null,
          ingestDuplicateLookbackDays: (initial.ingestDuplicateLookbackDays as number | null) ?? null,
          ingestConfidenceHighMin: (initial.ingestConfidenceHighMin as number | null) ?? null,
          ingestConfidenceMediumMin: (initial.ingestConfidenceMediumMin as number | null) ?? null,
        }} /></TabsContent>
        <TabsContent value="payments"><PaymentsSettingsClient initial={{
          stripePublishableKey: (initial.stripePublishableKey as string | null) ?? null,
          stripeSecretKeySet: Boolean(initial.stripeSecretKeySet),
          stripeWebhookSecretSet: Boolean(initial.stripeWebhookSecretSet),
          platformFeePercent: Number(initial.platformFeePercent ?? 5),
        }} /></TabsContent>
        <TabsContent value="notifications"><NotificationSettings initial={initial} /></TabsContent>
        <TabsContent value="seo"><SeoSettingsClient initial={{ googleIndexingEnabled: Boolean(initial.googleIndexingEnabled), googleServiceAccountJsonSet: Boolean(initial.googleServiceAccountJsonSet) }} /></TabsContent>
        <TabsContent value="ops"><OpsSettings initial={initial} /></TabsContent>
        <TabsContent value="cron"><CronSettingsClient /></TabsContent>
      </div>
    </Tabs>
  );
}

function GeneralSettings({ initial }: { initial: Record<string, unknown> }) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analyticsSalt: value.trim() || null }) }); setSaving(false); }
  return <section className="rounded-lg border bg-background p-4 space-y-4"><h2 className="text-base font-semibold">General</h2><div className="space-y-2"><label className="text-sm font-medium">Analytics salt</label>{show ? <input type="password" className="w-full rounded-md border px-3 py-2 text-sm" value={value} onChange={(e)=>setValue(e.target.value)} placeholder={initial.analyticsSalt ? "•••••••• (stored)" : "salt"} /> : <div className="text-xs text-muted-foreground">{initial.analyticsSalt ? "••••••••" : "Not set"} <button type="button" className="underline" onClick={()=>setShow(true)}>Change</button></div>}<p className="text-xs text-muted-foreground">Changing this salt invalidates existing page-view deduplication counts.</p></div><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button></section>;
}

function NotificationSettings({ initial }: { initial: Record<string, unknown> }) {
  const [to, setTo] = useState((initial.editorialNotifyTo as string | null) ?? "");
  const [url, setUrl] = useState((initial.editorialNotificationsWebhookUrl as string | null) ?? "");
  const [emailEnabled, setEmailEnabled] = useState(Boolean(initial.editorialNotificationsEmailEnabled));
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ editorialNotifyTo: to.trim() || null, editorialNotificationsWebhookUrl: url.trim() || null, editorialNotificationsEmailEnabled: emailEnabled }) }); setSaving(false); }
  return <section className="rounded-lg border bg-background p-4 space-y-4"><h2 className="text-base font-semibold">Notifications</h2><input className="w-full rounded-md border px-3 py-2 text-sm" value={to} onChange={(e)=>setTo(e.target.value)} placeholder="team@example.com" /><input className="w-full rounded-md border px-3 py-2 text-sm" value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="https://..." /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={emailEnabled} onChange={(e)=>setEmailEnabled(e.target.checked)} />Enable editorial notification emails</label><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button></section>;
}

function OpsSettings({ initial }: { initial: Record<string, unknown> }) {
  const [url, setUrl] = useState((initial.alertWebhookUrl as string | null) ?? "");
  const [secret, setSecret] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alertWebhookUrl: url.trim() || null, alertWebhookSecret: show ? (secret.trim() || null) : undefined }) }); setSaving(false); }
  return <section className="rounded-lg border bg-background p-4 space-y-4"><h2 className="text-base font-semibold">Ops</h2><input className="w-full rounded-md border px-3 py-2 text-sm" value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="https://..." />{show ? <input type="password" className="w-full rounded-md border px-3 py-2 text-sm" value={secret} onChange={(e)=>setSecret(e.target.value)} placeholder={Boolean(initial.alertWebhookSecretSet) ? "•••••••• (stored)" : "secret"} /> : <div className="text-xs text-muted-foreground">{Boolean(initial.alertWebhookSecretSet) ? "Secret stored." : "Secret not set."} <button className="underline" type="button" onClick={()=>setShow(true)}>Change</button></div>}<Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button></section>;
}
