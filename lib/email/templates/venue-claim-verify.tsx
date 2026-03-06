import { Preview } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

type VenueClaimVerifyPayload = {
  venueName: string;
  verifyUrl: string;
};

const BRAND_RED = "#E63946";

export function getSubject({ venueName }: VenueClaimVerifyPayload) {
  return `Verify your claim for ${venueName}`;
}

export default function VenueClaimVerifyEmail({ venueName, verifyUrl }: VenueClaimVerifyPayload) {
  return (
    <EmailLayout preview={`Verify your claim for ${venueName}.`}>
      <Preview>{`Verify your claim for ${venueName}.`}</Preview>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr><td><p style={{ margin: "0 0 16px" }}>Please verify your claim for <strong>{venueName}</strong>.</p></td></tr>
          <tr><td><p style={{ margin: "0 0 16px" }}>For security, this link expires in 60 minutes.</p></td></tr>
          <tr>
            <td>
              <a href={verifyUrl} style={{ backgroundColor: BRAND_RED, color: "#ffffff", textDecoration: "none", padding: "12px 20px", borderRadius: "4px", display: "inline-block", fontWeight: "bold" }}>Verify claim</a>
              <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#6B7280" }}>{verifyUrl}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </EmailLayout>
  );
}
