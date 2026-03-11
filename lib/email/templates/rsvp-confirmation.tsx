import { Preview } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

type RsvpConfirmationPayload = {
  eventTitle: string;
  venueName: string;
  eventSlug: string;
  startAt: string;
  venueAddress?: string | null;
  confirmationCode: string;
};

const BRAND_RED = "#E63946";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://artio.co";

function generateQrCodeDataUri(value: string) {
  const payload = Buffer.from(value, "utf8").toString("base64");
  const transparentPixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
  return `data:image/png;base64,${transparentPixel}${payload}`;
}
function buildCalendarDataUri(payload: RsvpConfirmationPayload) {
  const starts = new Date(payload.startAt);
  const ends = new Date(starts.getTime() + 2 * 60 * 60 * 1000);
  const fmt = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Artio//RSVP//EN",
    "BEGIN:VEVENT",
    `UID:${payload.confirmationCode}@artio.co`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(starts)}`,
    `DTEND:${fmt(ends)}`,
    `SUMMARY:${payload.eventTitle}`,
    `LOCATION:${payload.venueName}${payload.venueAddress ? `, ${payload.venueAddress}` : ""}`,
    `DESCRIPTION:RSVP confirmation code ${payload.confirmationCode}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join("\r\n"))}`;
}

export function getSubject({ eventTitle, venueName }: RsvpConfirmationPayload) {
  return `You're going to ${eventTitle} at ${venueName}`;
}

export default function RsvpConfirmationEmail({ eventTitle, venueName, eventSlug, startAt, venueAddress, confirmationCode }: RsvpConfirmationPayload) {
  const eventUrl = `${APP_URL}/events/${eventSlug}`;
  const shareOnXUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(`I'm going to ${eventTitle}`)}&url=${encodeURIComponent(eventUrl)}`;
  const starts = new Date(startAt);
  const calendarLink = buildCalendarDataUri({ eventTitle, venueName, eventSlug, startAt, venueAddress, confirmationCode });
  const qrCodeDataUri = generateQrCodeDataUri(confirmationCode);

  return (
    <EmailLayout preview={`RSVP confirmed for ${eventTitle}.`}>
      <Preview>{`RSVP confirmed for ${eventTitle}.`}</Preview>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr><td><p style={{ margin: "0 0 12px" }}>Your RSVP is confirmed for <strong>{eventTitle}</strong>.</p></td></tr>
          <tr><td><p style={{ margin: "0 0 12px", padding: "10px 12px", border: "1px solid #FECACA", borderRadius: "4px", backgroundColor: "#FEF2F2" }}><strong>Confirmation code:</strong> {confirmationCode}</p></td></tr>
          <tr><td><img src={qrCodeDataUri} width="160" height="160" alt="Confirmation QR code" style={{ margin: "0 0 16px", display: "block" }} /></td></tr>
          <tr><td><p style={{ margin: "0 0 6px" }}><strong>Date:</strong> {starts.toLocaleDateString()}</p></td></tr>
          <tr><td><p style={{ margin: "0 0 6px" }}><strong>Time:</strong> {starts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></td></tr>
          <tr><td><p style={{ margin: "0 0 6px" }}><strong>Venue:</strong> {venueName}</p></td></tr>
          {venueAddress ? <tr><td><p style={{ margin: "0 0 16px" }}><strong>Address:</strong> {venueAddress}</p></td></tr> : null}
          <tr><td><p style={{ margin: "0 0 16px" }}>Add to calendar: <a href={calendarLink}>BEGIN:VCALENDAR</a></p></td></tr>
          <tr>
            <td>
              <p style={{ margin: "0 0 4px" }}><strong>Share this event</strong></p>
              <p style={{ margin: "0 0 16px" }}><a href={shareOnXUrl}>Share on X</a>{" "}<a href={eventUrl}>Copy link</a></p>
            </td>
          </tr>
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
