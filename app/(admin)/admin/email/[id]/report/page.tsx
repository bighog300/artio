import Link from "next/link";
import { notFound } from "next/navigation";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin";
import { getServerBaseUrl } from "@/lib/server/get-base-url";
import type { EmailCampaign } from "../../campaign-types";

async function fetchCampaign(id: string): Promise<EmailCampaign | null> {
  const baseUrl = await getServerBaseUrl();
  const res = await fetch(`${baseUrl}/api/admin/email/campaigns`, { cache: "no-store" });
  if (!res.ok) return null;
  const payload = (await res.json()) as { campaigns: EmailCampaign[] };
  return payload.campaigns.find((campaign) => campaign.id === id) ?? null;
}

function statTile(label: string, value: number) {
  return (
    <div className="rounded border bg-background p-4" key={label}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default async function CampaignReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const campaign = await fetchCampaign(id);

  if (!campaign) {
    notFound();
  }

  const skippedCount = Math.max((campaign.recipientCount ?? 0) - campaign.deliveredCount - campaign.bouncedCount, 0);

  return (
    <main className="space-y-4 p-6">
      <AdminPageHeader
        title={`Campaign Report: ${campaign.name}`}
        description="Delivery and engagement snapshot for this send."
        backHref={`/admin/email/${campaign.id}`}
        backLabel="Back to Campaign"
      />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{campaign.status}</Badge>
        <span>{campaign.sentAt ? `Sent ${new Date(campaign.sentAt).toLocaleString()}` : "Not sent yet"}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {[
          statTile("Delivered", campaign.deliveredCount),
          statTile("Opened", campaign.openedCount),
          statTile("Bounced", campaign.bouncedCount),
          statTile("Skipped", skippedCount),
        ]}
      </div>
      <p className="text-sm text-muted-foreground">
        Need to adjust content or audience? <Link href={`/admin/email/${campaign.id}`} className="underline">Return to editor</Link>.
      </p>
    </main>
  );
}
