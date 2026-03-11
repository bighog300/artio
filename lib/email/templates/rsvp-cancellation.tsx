import { Preview } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

const BRAND_RED = "#E63946";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://artio.co";

type RsvpCancellationPayload = {
  eventTitle: string;
  eventSlug?: string | null;
  reason?: string | null;
  cancelledByOrganiser?: boolean;
};

export function getSubject({ eventTitle }: RsvpCancellationPayload) {
  return `Your RSVP for ${eventTitle} has been cancelled`;
}

export default function RsvpCancellationEmail({ eventTitle, eventSlug, reason, cancelledByOrganiser }: RsvpCancellationPayload) {
  const eventUrl = eventSlug ? `${APP_URL}/events/${eventSlug}` : null;

  return (
    <EmailLayout preview={`Your RSVP for ${eventTitle} has been cancelled.`}>
      <Preview>{`Your RSVP for ${eventTitle} has been cancelled.`}</Preview>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr><td><p style={{ margin: "0 0 12px" }}>Your RSVP for <strong>{eventTitle}</strong> has been cancelled.</p></td></tr>
          {cancelledByOrganiser ? <tr><td><p style={{ margin: "0 0 12px" }}>This cancellation was made by the organiser.</p></td></tr> : null}
          {reason ? <tr><td><p style={{ margin: "0 0 16px" }}><strong>Reason:</strong> {reason}</p></td></tr> : null}
          {eventUrl ? (
            <tr>
              <td>
                <a href={eventUrl} style={{ backgroundColor: BRAND_RED, color: "#ffffff", textDecoration: "none", padding: "12px 20px", borderRadius: "4px", display: "inline-block", fontWeight: "bold" }}>View event</a>
                <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#6B7280" }}>{eventUrl}</p>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </EmailLayout>
  );
}
