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
import ConfigurationClient from "./configuration-client";
import { ConnectivityPanel } from "./connectivity-panel";
import type { SiteSettingsShape } from "@/lib/site-settings/types";

const TABS = ["general", "email", "ingest-ai", "payments", "notifications", "seo", "ops", "cron", "configuration"] as const;
type TabKey = (typeof TABS)[number];

function isTab(value: string | null): value is TabKey { return !!value && (TABS as readonly string[]).includes(value); }

export default function SettingsShell({ initial }: { initial: SiteSettingsShape }) {
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
    emailEnabled: initial.emailEnabled,
    emailFromAddress: initial.emailFromAddress,
    resendApiKeySet: initial.resendApiKeySet,
    resendFromAddress: initial.resendFromAddress,
    emailOutboxBatchSize: initial.emailOutboxBatchSize,
  }), [initial]);

  return (
    <div className="space-y-4">
      <ConnectivityPanel
        initial={{
          googlePseConfigured: initial.googlePseApiKeySet && Boolean(initial.googlePseCx),
          braveConfigured: initial.braveSearchApiKeySet,
          openAiConfigured: initial.openAiApiKeySet,
          geminiConfigured: initial.geminiApiKeySet,
          anthropicConfigured: initial.anthropicApiKeySet,
          resendConfigured: Boolean(initial.resendApiKeySet),
          stripeConfigured: initial.stripeSecretKeySet,
          googleIndexingConfigured: initial.googleServiceAccountJsonSet,
        }}
      />

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
          <TabsTrigger className="justify-start" value="configuration">Configuration</TabsTrigger>
        </TabsList>

        <div>
          <TabsContent value="general"><GeneralSettings initial={initial} /></TabsContent>
          <TabsContent value="email"><EmailSettingsClient initial={emailInitial} /></TabsContent>
          <TabsContent value="ingest-ai"><IngestSettingsClient initial={{
          ingestSystemPrompt: initial.ingestSystemPrompt,
          artworkExtractionSystemPrompt: initial.artworkExtractionSystemPrompt,
          artistBioSystemPrompt: initial.artistBioSystemPrompt,
          ingestModel: initial.ingestModel,
          ingestMaxOutputTokens: initial.ingestMaxOutputTokens,
          eventExtractionProvider: initial.eventExtractionProvider,
          artworkExtractionProvider: initial.artworkExtractionProvider,
          artistLookupProvider: initial.artistLookupProvider,
          artistBioProvider: initial.artistBioProvider,
          ingestEnabled: initial.ingestEnabled,
          ingestImageEnabled: initial.ingestImageEnabled,
          venueAutoPublish: initial.venueAutoPublish,
          regionAutoPublishVenues: initial.regionAutoPublishVenues,
          regionAutoPublishEvents: initial.regionAutoPublishEvents,
          regionAutoPublishArtists: initial.regionAutoPublishArtists,
          enrichMatchedArtists: initial.enrichMatchedArtists,
          regionAutoPublishArtworks: initial.regionAutoPublishArtworks,
          regionDiscoveryEnabled: initial.regionDiscoveryEnabled,
          regionMaxVenuesPerRun: initial.regionMaxVenuesPerRun,
          venueGenerationModel: initial.venueGenerationModel,
          ingestMaxCandidatesPerVenueRun: initial.ingestMaxCandidatesPerVenueRun,
          ingestDuplicateSimilarityThreshold: initial.ingestDuplicateSimilarityThreshold,
          ingestDuplicateLookbackDays: initial.ingestDuplicateLookbackDays,
          ingestConfidenceHighMin: initial.ingestConfidenceHighMin,
          ingestConfidenceMediumMin: initial.ingestConfidenceMediumMin,
          autoTagEnabled: initial.autoTagEnabled,
          autoTagProvider: initial.autoTagProvider,
          autoTagModel: initial.autoTagModel,
        }} /></TabsContent>
          <TabsContent value="payments"><PaymentsSettingsClient initial={{
          stripeSecretKeySet: initial.stripeSecretKeySet,
          platformFeePercent: initial.platformFeePercent,
        }} /></TabsContent>
          <TabsContent value="notifications"><NotificationSettings initial={initial} /></TabsContent>
          <TabsContent value="seo"><SeoSettingsClient initial={{ googleIndexingEnabled: initial.googleIndexingEnabled, googleServiceAccountJsonSet: initial.googleServiceAccountJsonSet }} /></TabsContent>
          <TabsContent value="ops"><OpsSettings initial={initial} /></TabsContent>
          <TabsContent value="cron"><CronSettingsClient /></TabsContent>
          <TabsContent value="configuration"><ConfigurationClient initial={{
            openAiApiKeySet: initial.openAiApiKeySet,
            geminiApiKeySet: initial.geminiApiKeySet,
            anthropicApiKeySet: initial.anthropicApiKeySet,
            googlePseApiKeySet: initial.googlePseApiKeySet,
            googlePseCx: initial.googlePseCx,
            braveSearchApiKeySet: initial.braveSearchApiKeySet,
            resendApiKeySet: initial.resendApiKeySet,
            stripePublishableKey: initial.stripePublishableKey,
            stripeSecretKeySet: initial.stripeSecretKeySet,
            stripeWebhookSecretSet: initial.stripeWebhookSecretSet,
            googleServiceAccountJsonSet: initial.googleServiceAccountJsonSet,
            envFallbacks: initial.envFallbacks ?? {
              OPENAI_API_KEY: false,
              GEMINI_API_KEY: false,
              ANTHROPIC_API_KEY: false,
              GOOGLE_PSE_API_KEY: false,
              GOOGLE_PSE_CX: false,
              BRAVE_SEARCH_API_KEY: false,
              RESEND_API_KEY: false,
              STRIPE_SECRET_KEY: false,
              STRIPE_PUBLISHABLE_KEY: false,
              STRIPE_WEBHOOK_SECRET: false,
              GOOGLE_SERVICE_ACCOUNT_JSON: false,
            },
          }} /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function GeneralSettings({ initial }: { initial: SiteSettingsShape }) {
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analyticsSalt: value.trim() || null }) }); setSaving(false); }
  return <section className="rounded-lg border bg-background p-4 space-y-4"><h2 className="text-base font-semibold">General</h2><div className="space-y-2"><label className="text-sm font-medium">Analytics salt</label>{show ? <input type="password" className="w-full rounded-md border px-3 py-2 text-sm" value={value} onChange={(e)=>setValue(e.target.value)} placeholder={initial.analyticsSalt ? "•••••••• (stored)" : "salt"} /> : <div className="text-xs text-muted-foreground">{initial.analyticsSalt ? "••••••••" : "Not set"} <button type="button" className="underline" onClick={()=>setShow(true)}>Change</button></div>}<p className="text-xs text-muted-foreground">Changing this salt invalidates existing page-view deduplication counts.</p></div><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button></section>;
}

function NotificationSettings({ initial }: { initial: SiteSettingsShape }) {
  const [to, setTo] = useState(initial.editorialNotifyTo ?? "");
  const [url, setUrl] = useState(initial.editorialNotificationsWebhookUrl ?? "");
  const [emailEnabled, setEmailEnabled] = useState(initial.editorialNotificationsEmailEnabled);
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ editorialNotifyTo: to.trim() || null, editorialNotificationsWebhookUrl: url.trim() || null, editorialNotificationsEmailEnabled: emailEnabled }) }); setSaving(false); }
  return <section className="rounded-lg border bg-background p-4 space-y-4"><h2 className="text-base font-semibold">Notifications</h2><input className="w-full rounded-md border px-3 py-2 text-sm" value={to} onChange={(e)=>setTo(e.target.value)} placeholder="team@example.com" /><input className="w-full rounded-md border px-3 py-2 text-sm" value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="https://..." /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={emailEnabled} onChange={(e)=>setEmailEnabled(e.target.checked)} />Enable editorial notification emails</label><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button></section>;
}

function OpsSettings({ initial }: { initial: SiteSettingsShape }) {
  const [url, setUrl] = useState(initial.alertWebhookUrl ?? "");
  const [secret, setSecret] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  async function save() { setSaving(true); await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alertWebhookUrl: url.trim() || null, alertWebhookSecret: show ? (secret.trim() || null) : undefined }) }); setSaving(false); }
  return <section className="rounded-lg border bg-background p-4 space-y-4"><h2 className="text-base font-semibold">Ops</h2><input className="w-full rounded-md border px-3 py-2 text-sm" value={url} onChange={(e)=>setUrl(e.target.value)} placeholder="https://..." />{show ? <input type="password" className="w-full rounded-md border px-3 py-2 text-sm" value={secret} onChange={(e)=>setSecret(e.target.value)} placeholder={Boolean(initial.alertWebhookSecretSet) ? "•••••••• (stored)" : "secret"} /> : <div className="text-xs text-muted-foreground">{Boolean(initial.alertWebhookSecretSet) ? "Secret stored." : "Secret not set."} <button className="underline" type="button" onClick={()=>setShow(true)}>Change</button></div>}<Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button></section>;
}
