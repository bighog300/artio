"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CAMPAIGN_AUDIENCES, type CampaignAudience, type EmailCampaign, formatAudience } from "./campaign-types";

type CampaignEditorClientProps = {
  campaignId?: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toIsoOrNull(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

export default function CampaignEditorClient({ campaignId }: CampaignEditorClientProps) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p>Hello from Artio.</p>");
  const [audienceType, setAudienceType] = useState<CampaignAudience>("ALL_USERS");
  const [scheduledEnabled, setScheduledEnabled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [estimatedRecipients, setEstimatedRecipients] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [activeCampaignId, setActiveCampaignId] = useState<string | undefined>(campaignId);
  const [isBootstrapping, setIsBootstrapping] = useState(Boolean(campaignId));

  useEffect(() => {
    if (!campaignId) return;

    let isMounted = true;

    async function loadCampaign() {
      try {
        const res = await fetch("/api/admin/email/campaigns", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load campaign");
        const payload = (await res.json()) as { campaigns: EmailCampaign[] };
        const campaign = payload.campaigns.find((entry) => entry.id === campaignId);
        if (!campaign) throw new Error("Campaign not found");

        if (isMounted) {
          setName(campaign.name);
          setSubject(campaign.subject);
          setBodyHtml(campaign.bodyHtml);
          setAudienceType(campaign.audienceType);
          setScheduledEnabled(Boolean(campaign.scheduledFor));
          setScheduledFor(toDateTimeLocal(campaign.scheduledFor));
        }
      } catch (cause) {
        if (isMounted) setError(cause instanceof Error ? cause.message : "Failed to load campaign");
      } finally {
        if (isMounted) setIsBootstrapping(false);
      }
    }

    void loadCampaign();
    return () => {
      isMounted = false;
    };
  }, [campaignId]);

  useEffect(() => {
    let isMounted = true;

    async function loadEstimate() {
      try {
        const res = await fetch(`/api/admin/email/campaigns/estimate?audience=${audienceType}`, { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 404) {
            if (isMounted) setEstimatedRecipients(null);
            return;
          }
          throw new Error("Unable to estimate audience");
        }
        const payload = (await res.json()) as { count: number };
        if (isMounted) setEstimatedRecipients(payload.count);
      } catch {
        if (isMounted) setEstimatedRecipients(null);
      }
    }

    void loadEstimate();
    return () => {
      isMounted = false;
    };
  }, [audienceType]);

  const previewHtml = useMemo(() => bodyHtml, [bodyHtml]);

  async function saveCampaign(): Promise<string | undefined> {
    setSaveState("saving");
    setError(null);

    const payload = {
      name,
      subject,
      bodyHtml,
      audienceType,
      scheduledFor: scheduledEnabled ? toIsoOrNull(scheduledFor) : null,
      status: scheduledEnabled ? "SCHEDULED" : "DRAFT",
    };

    try {
      if (!activeCampaignId) {
        const createRes = await fetch("/api/admin/email/campaigns", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!createRes.ok) throw new Error("Failed to create campaign");
        const created = (await createRes.json()) as EmailCampaign;
        setActiveCampaignId(created.id);
        window.history.replaceState(null, "", `/admin/email/${created.id}`);
        setSaveState("saved");
        return created.id;
      } else {
        const updateRes = await fetch(`/api/admin/email/campaigns/${activeCampaignId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!updateRes.ok) throw new Error("Failed to save campaign");
      }

      setSaveState("saved");
      return activeCampaignId;
    } catch (cause) {
      setSaveState("error");
      setError(cause instanceof Error ? cause.message : "Failed to save campaign");
      return undefined;
    }
  }

  async function sendCampaign() {
    try {
      const id = activeCampaignId ?? (await saveCampaign());
      if (!id) return;

      setError(null);
      const res = await fetch(`/api/admin/email/campaigns/${id}/send`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to send campaign");
      window.location.assign(`/admin/email/${id}/report`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to send campaign");
    }
  }

  if (isBootstrapping) {
    return <p className="text-sm text-muted-foreground">Loading campaign…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Campaign name</span>
          <input className="w-full rounded border p-2" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Subject</span>
          <input className="w-full rounded border p-2" value={subject} onChange={(event) => setSubject(event.target.value)} />
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Body (HTML)</span>
        <textarea className="min-h-48 w-full rounded border p-2 font-mono text-xs" value={bodyHtml} onChange={(event) => setBodyHtml(event.target.value)} />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Audience</span>
          <select
            className="w-full rounded border bg-background p-2"
            value={audienceType}
            onChange={(event) => setAudienceType(event.target.value as CampaignAudience)}
          >
            {CAMPAIGN_AUDIENCES.map((audience) => (
              <option key={audience} value={audience}>
                {formatAudience(audience)}
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-1 text-sm">
          <p className="font-medium">Estimated recipients</p>
          <p className="rounded border bg-muted/20 p-2">{estimatedRecipients ?? "—"}</p>
        </div>
      </div>

      <div className="space-y-2 rounded border p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={scheduledEnabled}
            onChange={(event) => setScheduledEnabled(event.target.checked)}
          />
          Schedule send
        </label>
        {scheduledEnabled ? (
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Scheduled datetime</span>
            <input
              type="datetime-local"
              className="w-full rounded border p-2"
              value={scheduledFor}
              onChange={(event) => setScheduledFor(event.target.value)}
            />
          </label>
        ) : null}
      </div>

      <details className="rounded border p-3">
        <summary className="cursor-pointer text-sm font-medium">Preview</summary>
        <div className="mt-3 h-80 overflow-hidden rounded border">
          <iframe title="Campaign preview" className="h-full w-full" sandbox="" srcDoc={previewHtml} />
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={saveCampaign} disabled={!name || !subject || !bodyHtml || saveState === "saving"}>
          {saveState === "saving" ? "Saving…" : "Save draft"}
        </Button>
        <Button variant="secondary" onClick={sendCampaign} disabled={!name || !subject || !bodyHtml}>
          {scheduledEnabled ? "Schedule" : "Send"}
        </Button>
        {activeCampaignId ? (
          <Button variant="outline" asChild>
            <Link href={`/admin/email/${activeCampaignId}/report`}>View report</Link>
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saveState === "saved" ? <p className="text-sm text-emerald-700">Campaign saved.</p> : null}
    </div>
  );
}
