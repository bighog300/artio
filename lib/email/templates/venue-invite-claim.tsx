import { Preview } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

type VenueInviteClaimPayload = {
  venueName: string;
  venueSlug: string;
  venueDescription?: string;
  upcomingEventCount: number;
  personalMessage?: string;
  claimUrl: string;
  expiresAt: Date;
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(value);
}

export function getSubject({ venueName }: VenueInviteClaimPayload) {
  return `You're invited to manage ${venueName} on Artpulse`;
}

export default function VenueInviteClaimEmail({
  venueName,
  venueDescription,
  upcomingEventCount,
  personalMessage,
  claimUrl,
  expiresAt,
}: VenueInviteClaimPayload) {
  return (
    <EmailLayout preview={`Claim your venue profile for ${venueName} on Artpulse.`}>
      <Preview>{`You're invited to manage ${venueName} on Artpulse.`}</Preview>
      <p style={{ margin: "0 0 16px" }}>
        Artpulse helps people discover exhibitions, events, and cultural spaces. Your venue is already listed on our platform.
      </p>
      <h2 style={{ margin: "0 0 8px", fontSize: "24px" }}>{venueName}</h2>
      {venueDescription ? <p style={{ margin: "0 0 18px", color: "#4b5563" }}>{venueDescription}</p> : null}
      {upcomingEventCount > 0 ? (
        <div style={{ margin: "0 0 18px", padding: "12px", borderRadius: "8px", backgroundColor: "#eef2ff", color: "#1e3a8a", fontWeight: 600 }}>
          You already have {upcomingEventCount} upcoming event{upcomingEventCount === 1 ? "" : "s"} listed
        </div>
      ) : null}
      {personalMessage ? (
        <blockquote style={{ margin: "0 0 20px", borderLeft: "4px solid #cbd5e1", backgroundColor: "#f8fafc", padding: "10px 14px", color: "#0f172a", whiteSpace: "pre-wrap" }}>
          {personalMessage}
        </blockquote>
      ) : null}
      <p style={{ margin: "0 0 20px" }}>
        <a href={claimUrl} style={{ display: "inline-block", borderRadius: "6px", backgroundColor: "#111827", color: "#ffffff", textDecoration: "none", padding: "12px 18px", fontWeight: 700 }}>
          Claim your venue
        </a>
      </p>
      <p style={{ margin: "0", color: "#6b7280", fontSize: "13px" }}>This invite expires on {formatDate(expiresAt)}.</p>
    </EmailLayout>
  );
}
