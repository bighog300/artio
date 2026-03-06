import { Preview } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

type VenueClaimRejectedPayload = {
  venueName: string;
  venueSlug: string;
  reason?: string | null;
};

const BRAND_RED = "#E63946";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://artpulse.co";

export function getSubject({ venueName }: VenueClaimRejectedPayload) {
  return `Your claim for ${venueName} was not approved`;
}

export default function VenueClaimRejectedEmail({ venueName, venueSlug, reason }: VenueClaimRejectedPayload) {
  const retryUrl = `${APP_URL}/venues/${venueSlug}/claim`;

  return (
    <EmailLayout preview={`Your claim for ${venueName} was not approved.`}>
      <Preview>{`Your claim for ${venueName} was not approved.`}</Preview>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr><td><p style={{ margin: "0 0 16px" }}>Your claim for <strong>{venueName}</strong> was not approved this time.</p></td></tr>
          {reason ? <tr><td><p style={{ margin: "0 0 16px" }}><strong>Reason:</strong> {reason}</p></td></tr> : null}
          <tr>
            <td>
              <a href={retryUrl} style={{ backgroundColor: BRAND_RED, color: "#ffffff", textDecoration: "none", padding: "12px 20px", borderRadius: "4px", display: "inline-block", fontWeight: "bold" }}>Try again</a>
              <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#6B7280" }}>{retryUrl}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </EmailLayout>
  );
}
