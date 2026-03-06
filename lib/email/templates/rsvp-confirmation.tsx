import { Preview } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

type RsvpConfirmationPayload = {
  eventTitle: string;
  venueName: string;
  eventSlug: string;
  startAt: string;
  venueAddress?: string | null;
};

const BRAND_RED = "#E63946";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://artpulse.co";

export function getSubject({ eventTitle, venueName }: RsvpConfirmationPayload) {
  return `You're going to ${eventTitle} at ${venueName}`;
}

export default function RsvpConfirmationEmail({ eventTitle, venueName, eventSlug, startAt, venueAddress }: RsvpConfirmationPayload) {
  const eventUrl = `${APP_URL}/events/${eventSlug}`;
  const starts = new Date(startAt);

  return (
    <EmailLayout preview={`RSVP confirmed for ${eventTitle}.`}>
      <Preview>{`RSVP confirmed for ${eventTitle}.`}</Preview>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr><td><p style={{ margin: "0 0 12px" }}>Your RSVP is confirmed for <strong>{eventTitle}</strong>.</p></td></tr>
          <tr><td><p style={{ margin: "0 0 6px" }}><strong>Date:</strong> {starts.toLocaleDateString()}</p></td></tr>
          <tr><td><p style={{ margin: "0 0 6px" }}><strong>Time:</strong> {starts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></td></tr>
          <tr><td><p style={{ margin: "0 0 6px" }}><strong>Venue:</strong> {venueName}</p></td></tr>
          {venueAddress ? <tr><td><p style={{ margin: "0 0 16px" }}><strong>Address:</strong> {venueAddress}</p></td></tr> : null}
          <tr>
            <td>
              <a href={eventUrl} style={{ backgroundColor: BRAND_RED, color: "#ffffff", textDecoration: "none", padding: "12px 20px", borderRadius: "4px", display: "inline-block", fontWeight: "bold" }}>View event</a>
              <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#6B7280" }}>{eventUrl}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </EmailLayout>
  );
}
