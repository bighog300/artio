import { Preview } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

type DigestEvent = {
  title: string;
  date: string;
  venue: string;
};

type WeeklyDigestPayload = {
  digestUrl: string;
  events: DigestEvent[];
};

const BRAND_RED = "#E63946";

export function getSubject() {
  return "Your weekly Artpulse digest is ready";
}

export default function WeeklyDigestEmail({ digestUrl, events }: WeeklyDigestPayload) {
  return (
    <EmailLayout preview="Your latest event picks are ready.">
      <Preview>Your latest event picks are ready.</Preview>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr>
            <td>
              <p style={{ margin: "0 0 16px" }}>Here are events selected for your weekly digest:</p>
              <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ border: "1px solid #E5E7EB" }}>
                <tbody>
                  {events.map((event, index) => (
                    <tr key={`${event.title}-${index}`}>
                      <td style={{ padding: "12px", borderBottom: index === events.length - 1 ? "none" : "1px solid #E5E7EB" }}>
                        <p style={{ margin: "0 0 4px", fontWeight: "bold" }}>{event.title}</p>
                        <p style={{ margin: "0", color: "#4B5563" }}>{event.date}</p>
                        <p style={{ margin: "4px 0 0", color: "#4B5563" }}>{event.venue}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td style={{ paddingTop: "20px" }}>
              <a href={digestUrl} style={{ backgroundColor: BRAND_RED, color: "#ffffff", textDecoration: "none", padding: "12px 20px", borderRadius: "4px", display: "inline-block", fontWeight: "bold" }}>
                View digest
              </a>
              <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#6B7280" }}>{digestUrl}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </EmailLayout>
  );
}
