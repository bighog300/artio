export const CAMPAIGN_AUDIENCES = ["ALL_USERS", "VENUE_OWNERS", "ARTISTS", "NEW_USERS_7D", "CUSTOM"] as const;

export type CampaignAudience = (typeof CAMPAIGN_AUDIENCES)[number];

export const CAMPAIGN_STATUSES = ["DRAFT", "SCHEDULED", "SENDING", "SENT", "CANCELLED"] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_TYPES = ["BROADCAST", "VENUE_CLAIM_INVITE"] as const;

export type CampaignType = (typeof CAMPAIGN_TYPES)[number];
