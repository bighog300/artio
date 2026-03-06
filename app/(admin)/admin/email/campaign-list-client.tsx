"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EmailCampaign } from "./campaign-types";
import { formatAudience } from "./campaign-types";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function statusVariant(status: EmailCampaign["status"]): "secondary" | "default" | "outline" | "destructive" {
  switch (status) {
    case "SENT":
      return "default";
    case "SENDING":
      return "secondary";
    case "CANCELLED":
      return "destructive";
    default:
      return "outline";
  }
}

export default function CampaignListClient() {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadCampaigns() {
      try {
        const res = await fetch("/api/admin/email/campaigns", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load campaigns");
        const payload = (await res.json()) as { campaigns: EmailCampaign[] };
        if (isMounted) setCampaigns(payload.campaigns);
      } catch (cause) {
        if (isMounted) setError(cause instanceof Error ? cause.message : "Failed to load campaigns");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadCampaigns();
    return () => {
      isMounted = false;
    };
  }, []);

  const rows = useMemo(() => campaigns, [campaigns]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading campaigns…</p>;
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button asChild>
          <Link href="/admin/email/new">New Campaign</Link>
        </Button>
      </div>
      <div className="overflow-x-auto rounded border bg-background">
        <table className="min-w-full divide-y text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Audience</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Recipients</th>
              <th className="px-3 py-2 font-medium">Sent</th>
              <th className="px-3 py-2 font-medium">Open rate</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((campaign) => (
              <tr key={campaign.id}>
                <td className="px-3 py-2">
                  <Link className="font-medium underline-offset-2 hover:underline" href={`/admin/email/${campaign.id}`}>
                    {campaign.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{formatAudience(campaign.audienceType)}</td>
                <td className="px-3 py-2">
                  <Badge variant={statusVariant(campaign.status)}>{campaign.status}</Badge>
                </td>
                <td className="px-3 py-2">{campaign.recipientCount ?? "—"}</td>
                <td className="px-3 py-2">{formatDate(campaign.sentAt)}</td>
                <td className="px-3 py-2">{formatPercent(campaign.openedCount, campaign.deliveredCount)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-muted-foreground" colSpan={6}>No campaigns yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
