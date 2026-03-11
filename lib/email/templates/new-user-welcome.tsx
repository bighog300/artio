import { Preview } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./_layout";

type NewUserWelcomePayload = {
  userName?: string | null;
};

const BRAND_RED = "#E63946";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://artio.co";

export function getSubject() {
  return "Welcome to Artio";
}

export default function NewUserWelcomeEmail({ userName }: NewUserWelcomePayload) {
  const eventsUrl = `${APP_URL}/events`;

  return (
    <EmailLayout preview="Welcome to Artio.">
      <Preview>Welcome to Artio.</Preview>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr><td><p style={{ margin: "0 0 16px" }}>Hi {userName?.trim() || "there"}, welcome to Artio.</p></td></tr>
          <tr><td><p style={{ margin: "0 0 16px" }}>Discover events, follow artists, and stay in the loop with what is happening near you.</p></td></tr>
          <tr>
            <td>
              <a href={eventsUrl} style={{ backgroundColor: BRAND_RED, color: "#ffffff", textDecoration: "none", padding: "12px 20px", borderRadius: "4px", display: "inline-block", fontWeight: "bold" }}>Explore events</a>
              <p style={{ margin: "10px 0 0", fontSize: "12px", color: "#6B7280" }}>{eventsUrl}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </EmailLayout>
  );
}
