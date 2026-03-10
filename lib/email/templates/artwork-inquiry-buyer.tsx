import { Preview } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

type ArtworkInquiryBuyerPayload = {
  artworkTitle: string;
  artworkSlug: string;
  artistName: string;
  priceFormatted: string | null;
};

const BRAND_RED = "#E63946";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://artpulse.co";

export function getSubject({ artworkTitle }: ArtworkInquiryBuyerPayload) {
  return `Your enquiry for ${artworkTitle} has been sent`;
}

export default function ArtworkInquiryBuyerEmail({ artworkTitle, artworkSlug, artistName, priceFormatted }: ArtworkInquiryBuyerPayload) {
  const artworkUrl = `${APP_URL}/artwork/${encodeURIComponent(artworkSlug)}`;

  return (
    <EmailLayout preview={`Your enquiry about ${artworkTitle} has been sent to ${artistName}.`}>
      <Preview>{`Your enquiry about ${artworkTitle} has been sent to ${artistName}.`}</Preview>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr><td><p style={{ margin: "0 0 16px" }}>Thanks — your enquiry about <strong>{artworkTitle}</strong> has been sent to <strong>{artistName}</strong>.</p></td></tr>
          {priceFormatted ? <tr><td><p style={{ margin: "0 0 16px" }}><strong>Price:</strong> {priceFormatted}</p></td></tr> : null}
          <tr>
            <td>
              <a href={artworkUrl} style={{ backgroundColor: BRAND_RED, color: "#ffffff", textDecoration: "none", padding: "12px 20px", borderRadius: "4px", display: "inline-block", fontWeight: "bold" }}>View artwork</a>
              <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#6B7280" }}>{artworkUrl}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </EmailLayout>
  );
}
