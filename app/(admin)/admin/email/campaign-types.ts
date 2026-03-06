export const CAMPAIGN_AUDIENCES = ["ALL_USERS", "VENUE_OWNERS", "ARTISTS", "NEW_USERS_7D", "CUSTOM"] as const;

export type CampaignAudience = (typeof CAMPAIGN_AUDIENCES)[number];

export type CampaignStatus = "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "CANCELLED";

export type EmailCampaign = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  audienceType: CampaignAudience;
  status: CampaignStatus;
  scheduledFor: string | null;
  sentAt: string | null;
  recipientCount: number | null;
  deliveredCount: number;
  openedCount: number;
  bouncedCount: number;
  createdAt: string;
};

export function formatAudience(audience: CampaignAudience): string {
  return audience.toLowerCase().split("_").map((segment) => segment[0]?.toUpperCase() + segment.slice(1)).join(" ");
}
