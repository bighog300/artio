"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CAMPAIGN_AUDIENCES, type CampaignAudience, type CampaignType, type EmailCampaign, formatAudience } from "./campaign-types";

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
  const router = useRouter();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p>Hello from Artio.</p>");
  const [audienceType, setAudienceType] = useState<CampaignAudience>("ALL_USERS");
  const [campaignType, setCampaignType] = useState<CampaignType>("BROADCAST");
  const [venueQuery, setVenueQuery] = useState("");
  const [venueOptions, setVenueOptions] = useState<Array<{ id: string; name: string; city: string | null; contactEmail: string | null; upcomingEventCount: number }>>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [personalMessage, setPersonalMessage] = useState("");
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
          setCampaignType(campaign.campaignType);
          const filter = (campaign.audienceFilter ?? {}) as { venueId?: string; recipientEmail?: string; personalMessage?: string; venueName?: string };
          setSelectedVenueId(filter.venueId ?? "");
          setRecipientEmail(filter.recipientEmail ?? "");
          setPersonalMessage(filter.personalMessage ?? "");
          setVenueQuery(filter.venueName ?? "");
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

  useEffect(() => {
    if (campaignType !== "VENUE_CLAIM_INVITE") return;
    let isMounted = true;

    async function searchVenues() {
      const query = venueQuery.trim();
      if (!query) {
        setVenueOptions([]);
        return;
      }
      const res = await fetch(`/api/admin/email/venue-claim/venues?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json() as { venues: Array<{ id: string; name: string; city: string | null; contactEmail: string | null; upcomingEventCount: number }> };
      if (isMounted) setVenueOptions(body.venues);
    }

    void searchVenues();
    return () => { isMounted = false; };
  }, [campaignType, venueQuery]);

  const selectedVenue = useMemo(
    () => venueOptions.find((entry) => entry.id === selectedVenueId) ?? null,
    [selectedVenueId, venueOptions],
  );

  useEffect(() => {
    if (selectedVenue?.contactEmail && !recipientEmail) {
      setRecipientEmail(selectedVenue.contactEmail);
    }
  }, [selectedVenue, recipientEmail]);

  async function saveCampaign(): Promise<string | undefined> {
    setSaveState("saving");
    setError(null);

    const payload = {
      name,
      subject,
      bodyHtml,
      campaignType,
      audienceType,
      audienceFilter: campaignType === "VENUE_CLAIM_INVITE"
        ? {
            venueId: selectedVenueId,
            recipientEmail: recipientEmail.trim(),
            personalMessage: personalMessage.trim() || null,
            venueName: selectedVenue?.name ?? venueQuery,
          }
        : null,
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
        setSaveState("saved");
        router.push("/admin/email");
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
      <Link href="/admin/email" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        ← Back to campaigns
      </Link>
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
          <span className="font-medium">Campaign type</span>
          <select
            className="w-full rounded border bg-background p-2"
            value={campaignType}
            onChange={(event) => setCampaignType(event.target.value as CampaignType)}
          >
            <option value="BROADCAST">Broadcast</option>
            <option value="VENUE_CLAIM_INVITE">Venue claim invite</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Audience</span>
          <select
            className="w-full rounded border bg-background p-2"
            value={audienceType}
            onChange={(event) => setAudienceType(event.target.value as CampaignAudience)}
            disabled={campaignType === "VENUE_CLAIM_INVITE"}
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

      {campaignType === "VENUE_CLAIM_INVITE" ? (
        <div className="grid gap-4 rounded border p-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Venue selector</span>
            <input
              className="w-full rounded border p-2"
              list="venue-options"
              value={venueQuery}
              onChange={(event) => setVenueQuery(event.target.value)}
              placeholder="Search venue name"
            />
            <datalist id="venue-options">
              {venueOptions.map((venue) => (
                <option key={venue.id} value={venue.name} />
              ))}
            </datalist>
            <div className="flex flex-wrap gap-2">
              {venueOptions.map((venue) => (
                <button key={venue.id} type="button" className={`rounded border px-2 py-1 text-xs ${selectedVenueId === venue.id ? "bg-muted" : ""}`} onClick={() => { setSelectedVenueId(venue.id); setVenueQuery(venue.name); }}>
                  {venue.name} {venue.city ? `(${venue.city})` : ""}
                </button>
              ))}
            </div>
          </label>

          <div className="space-y-3 text-sm">
            <label className="block space-y-1">
              <span className="font-medium">Recipient email</span>
              <input className="w-full rounded border p-2" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} />
            </label>
            <label className="block space-y-1">
              <span className="font-medium">Personal message (optional)</span>
              <textarea maxLength={500} className="min-h-24 w-full rounded border p-2" value={personalMessage} onChange={(event) => setPersonalMessage(event.target.value)} />
            </label>
            <div className="rounded border bg-muted/20 p-2">
              <p className="font-medium">Invite stats preview</p>
              <p>Upcoming event count: {selectedVenue?.upcomingEventCount ?? "—"}</p>
            </div>
          </div>
        </div>
      ) : null}

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
        <Button onClick={saveCampaign} disabled={!name || !subject || !bodyHtml || saveState === "saving" || (campaignType === "VENUE_CLAIM_INVITE" && (!selectedVenueId || !recipientEmail.trim()))}>
          {saveState === "saving" ? "Saving…" : "Save draft"}
        </Button>
        <Button variant="secondary" onClick={sendCampaign} disabled={!name || !subject || !bodyHtml || (campaignType === "VENUE_CLAIM_INVITE" && (!selectedVenueId || !recipientEmail.trim()))}>
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
