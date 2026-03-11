import { Preview } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

type ArtworkInquiryArtistPayload = {
  artworkTitle: string;
  artworkSlug: string;
  buyerName: string;
  buyerEmail: string;
  message: string | null;
  priceFormatted: string | null;
};

const BRAND_RED = "#E63946";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://artio.co";

export function getSubject({ artworkTitle }: ArtworkInquiryArtistPayload) {
  return `New enquiry for ${artworkTitle}`;
}

export default function ArtworkInquiryArtistEmail({ artworkTitle, artworkSlug, buyerName, buyerEmail, message, priceFormatted }: ArtworkInquiryArtistPayload) {
  const artworkUrl = `${APP_URL}/artwork/${encodeURIComponent(artworkSlug)}`;
  const replyUrl = `mailto:${encodeURIComponent(buyerEmail)}`;

  return (
    <EmailLayout preview={`${buyerName} sent an enquiry for ${artworkTitle}.`}>
      <Preview>{`${buyerName} sent an enquiry for ${artworkTitle}.`}</Preview>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr><td><p style={{ margin: "0 0 16px" }}><strong>{buyerName}</strong> sent an enquiry for <strong>{artworkTitle}</strong>.</p></td></tr>
          <tr><td><p style={{ margin: "0 0 16px" }}><strong>Buyer email:</strong> <a href={`mailto:${buyerEmail}`}>{buyerEmail}</a></p></td></tr>
          {message ? <tr><td><p style={{ margin: "0 0 16px" }}><strong>Message:</strong> {message}</p></td></tr> : null}
          {priceFormatted ? <tr><td><p style={{ margin: "0 0 16px" }}><strong>Price:</strong> {priceFormatted}</p></td></tr> : null}
          <tr><td><p style={{ margin: "0 0 16px" }}><a href={artworkUrl}>{artworkUrl}</a></p></td></tr>
          <tr>
            <td>
              <a href={replyUrl} style={{ backgroundColor: BRAND_RED, color: "#ffffff", textDecoration: "none", padding: "12px 20px", borderRadius: "4px", display: "inline-block", fontWeight: "bold" }}>{`Reply to ${buyerName}`}</a>
              <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#6B7280" }}>{`mailto:${buyerEmail}`}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </EmailLayout>
  );
}
