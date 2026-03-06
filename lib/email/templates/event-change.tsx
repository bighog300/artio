import { Preview } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

type EventChangePayload = {
  eventTitle: string;
  eventSlug: string;
  changedFields: string[];
};

const BRAND_RED = "#E63946";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://artpulse.co";

export function getSubject({ eventTitle }: EventChangePayload) {
  return `${eventTitle} has been updated — check the details`;
}

export default function EventChangeEmail({ eventTitle, eventSlug, changedFields }: EventChangePayload) {
  const eventUrl = `${APP_URL}/events/${eventSlug}`;

  return (
    <EmailLayout preview={`${eventTitle} has been updated.`}>
      <Preview>{`${eventTitle} has been updated.`}</Preview>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr><td><p style={{ margin: "0 0 16px" }}><strong>{eventTitle}</strong> has new details:</p></td></tr>
          <tr>
            <td>
              <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ border: "1px solid #E5E7EB" }}>
                <tbody>
                  {changedFields.map((field, index) => (
                    <tr key={`${field}-${index}`}>
                      <td style={{ padding: "10px 12px", borderBottom: index === changedFields.length - 1 ? "none" : "1px solid #E5E7EB" }}>{field}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td style={{ paddingTop: "20px" }}>
              <a href={eventUrl} style={{ backgroundColor: BRAND_RED, color: "#ffffff", textDecoration: "none", padding: "12px 20px", borderRadius: "4px", display: "inline-block", fontWeight: "bold" }}>View updated event</a>
              <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#6B7280" }}>{eventUrl}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </EmailLayout>
  );
}
