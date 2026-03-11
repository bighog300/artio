import { Preview } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

type EventChangePayload = {
  eventTitle: string;
  eventSlug: string;
  changeDescription?: string | null;
};

const BRAND_RED = "#E63946";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://artio.co";

export function getSubject({ eventTitle }: EventChangePayload) {
  return `${eventTitle} has been updated — check the details`;
}

export default function EventChangeEmail({ eventTitle, eventSlug, changeDescription }: EventChangePayload) {
  const eventUrl = `${APP_URL}/events/${eventSlug}`;

  return (
    <EmailLayout preview={`${eventTitle} has been updated.`}>
      <Preview>{`${eventTitle} has been updated.`}</Preview>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr><td><p style={{ margin: "0 0 16px" }}><strong>{eventTitle}</strong> has new details.</p></td></tr>
          {changeDescription ? <tr><td><p style={{ margin: "0 0 16px" }}><strong>What changed:</strong> {changeDescription}</p></td></tr> : null}
          <tr>
            <td style={{ paddingTop: "8px" }}>
              <a href={eventUrl} style={{ backgroundColor: BRAND_RED, color: "#ffffff", textDecoration: "none", padding: "12px 20px", borderRadius: "4px", display: "inline-block", fontWeight: "bold" }}>View updated event</a>
              <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#6B7280" }}>{eventUrl}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </EmailLayout>
  );
}
