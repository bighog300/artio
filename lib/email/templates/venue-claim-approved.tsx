import { Preview } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

type VenueClaimApprovedPayload = {
  venueName: string;
  venueSlug: string;
};

const BRAND_RED = "#E63946";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://artio.co";

export function getSubject({ venueName }: VenueClaimApprovedPayload) {
  return `You now manage ${venueName} on Artio`;
}

export default function VenueClaimApprovedEmail({ venueName }: VenueClaimApprovedPayload) {
  const dashboardUrl = `${APP_URL}/my/venues`;

  return (
    <EmailLayout preview={`Your claim for ${venueName} has been approved.`}>
      <Preview>{`Your claim for ${venueName} has been approved.`}</Preview>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr><td><p style={{ margin: "0 0 16px" }}>Great news — your claim has been approved. You can now manage <strong>{venueName}</strong> on Artio.</p></td></tr>
          <tr>
            <td>
              <a href={dashboardUrl} style={{ backgroundColor: BRAND_RED, color: "#ffffff", textDecoration: "none", padding: "12px 20px", borderRadius: "4px", display: "inline-block", fontWeight: "bold" }}>Go to dashboard</a>
              <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#6B7280" }}>{dashboardUrl}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </EmailLayout>
  );
}
