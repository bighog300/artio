import * as React from "react";
import { EmailLayout } from "./_layout";

type VenueInvitePayload = {
  inviteId: string;
  inviteToken?: string | null;
  venueId?: string | null;
  role?: string | null;
};

export function getSubject() {
  return "You're invited to manage a venue on Artio";
}

export function VenueInviteEmail({ inviteToken, venueId, role }: VenueInvitePayload) {
  const href = inviteToken ? `/invite/${inviteToken}` : venueId ? `/my/venues/${venueId}` : null;

  return (
    <EmailLayout preview="You're invited to manage a venue on Artio">
      <p>You were invited as {(role ?? "editor").toLowerCase()} to collaborate on a venue.</p>
      {href ? <a href={href}>Open invitation</a> : null}
    </EmailLayout>
  );
}
