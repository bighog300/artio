/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotificationType } from "@prisma/client";
import React from "react";
import { render } from "@react-email/components";
import { NotificationTemplatePayload } from "@/lib/notification-templates";

type RenderedEmail = { subject: string; html: string; text: string };

export async function renderEmailTemplate(type: NotificationType, payload: NotificationTemplatePayload): Promise<RenderedEmail> {
  switch (type) {
    case "INVITE_CREATED": {
      if (payload.type !== "INVITE_CREATED") throw new Error("notification_template_payload_mismatch");
      const { VenueInviteEmail, getSubject } = await import("./templates/venue-invite");
      return {
        subject: getSubject(),
        html: await render(React.createElement(VenueInviteEmail, payload as any)),
        text: await render(React.createElement(VenueInviteEmail, payload as any), { plainText: true }),
      };
    }
    case "SUBMISSION_SUBMITTED": {
      if (payload.type !== "SUBMISSION_SUBMITTED") throw new Error("notification_template_payload_mismatch");
      const { SubmissionSubmittedEmail, getSubject } = await import("./templates/submission-submitted");
      return {
        subject: getSubject(),
        html: await render(React.createElement(SubmissionSubmittedEmail, payload as any)),
        text: await render(React.createElement(SubmissionSubmittedEmail, payload as any), { plainText: true }),
      };
    }
    case "SUBMISSION_APPROVED": {
      if (payload.type !== "SUBMISSION_APPROVED") throw new Error("notification_template_payload_mismatch");
      const { SubmissionApprovedEmail, getSubject } = await import("./templates/submission-approved");
      return {
        subject: getSubject(),
        html: await render(React.createElement(SubmissionApprovedEmail, payload as any)),
        text: await render(React.createElement(SubmissionApprovedEmail, payload as any), { plainText: true }),
      };
    }
    case "SUBMISSION_REJECTED": {
      if (payload.type !== "SUBMISSION_REJECTED") throw new Error("notification_template_payload_mismatch");
      const { SubmissionRejectedEmail, getSubject } = await import("./templates/submission-rejected");
      return {
        subject: getSubject(),
        html: await render(React.createElement(SubmissionRejectedEmail, payload as any)),
        text: await render(React.createElement(SubmissionRejectedEmail, payload as any), { plainText: true }),
      };
    }
    case "SAVED_SEARCH_MATCH": {
      if (payload.type !== "SAVED_SEARCH_MATCH") throw new Error("notification_template_payload_mismatch");
      const { SavedSearchMatchEmail, getSubject } = await import("./templates/saved-search-match");
      return {
        subject: getSubject(payload as any),
        html: await render(React.createElement(SavedSearchMatchEmail, payload as any)),
        text: await render(React.createElement(SavedSearchMatchEmail, payload as any), { plainText: true }),
      };
    }
    case "DIGEST_READY": {
      const { default: WeeklyDigestEmail, getSubject } = await import("./templates/weekly-digest");
      return {
        subject: getSubject(),
        html: await render(React.createElement(WeeklyDigestEmail, payload as any)),
        text: await render(React.createElement(WeeklyDigestEmail, payload as any), { plainText: true }),
      };
    }
    case "VENUE_CLAIM_VERIFY": {
      const { default: VenueClaimVerifyEmail, getSubject } = await import("./templates/venue-claim-verify");
      return {
        subject: getSubject(payload as any),
        html: await render(React.createElement(VenueClaimVerifyEmail, payload as any)),
        text: await render(React.createElement(VenueClaimVerifyEmail, payload as any), { plainText: true }),
      };
    }
    case "VENUE_CLAIM_APPROVED": {
      const { default: VenueClaimApprovedEmail, getSubject } = await import("./templates/venue-claim-approved");
      return {
        subject: getSubject(payload as any),
        html: await render(React.createElement(VenueClaimApprovedEmail, payload as any)),
        text: await render(React.createElement(VenueClaimApprovedEmail, payload as any), { plainText: true }),
      };
    }
    case "VENUE_CLAIM_REJECTED": {
      const { default: VenueClaimRejectedEmail, getSubject } = await import("./templates/venue-claim-rejected");
      return {
        subject: getSubject(payload as any),
        html: await render(React.createElement(VenueClaimRejectedEmail, payload as any)),
        text: await render(React.createElement(VenueClaimRejectedEmail, payload as any), { plainText: true }),
      };
    }
    case "VENUE_CLAIM_INVITE": {
      const { default: VenueInviteClaimEmail, getSubject } = await import("./templates/venue-invite-claim");
      const typedPayload = { ...(payload as any), expiresAt: new Date((payload as any).expiresAt) };
      return {
        subject: getSubject(typedPayload),
        html: await render(React.createElement(VenueInviteClaimEmail, typedPayload)),
        text: await render(React.createElement(VenueInviteClaimEmail, typedPayload), { plainText: true }),
      };
    }
    case "RSVP_CONFIRMED": {
      if (payload.type !== "RSVP_CONFIRMED") throw new Error("notification_template_payload_mismatch");
      const { default: RsvpConfirmationEmail, getSubject } = await import("./templates/rsvp-confirmation");
      return {
        subject: getSubject(payload as any),
        html: await render(React.createElement(RsvpConfirmationEmail, payload as any)),
        text: await render(React.createElement(RsvpConfirmationEmail, payload as any), { plainText: true }),
      };
    }
    case "RSVP_CANCELLED": {
      if (payload.type !== "RSVP_CANCELLED") throw new Error("notification_template_payload_mismatch");
      const { default: RsvpCancellationEmail, getSubject } = await import("./templates/rsvp-cancellation");
      return {
        subject: getSubject(payload as any),
        html: await render(React.createElement(RsvpCancellationEmail, payload as any)),
        text: await render(React.createElement(RsvpCancellationEmail, payload as any), { plainText: true }),
      };
    }
    case "EVENT_CHANGE_NOTIFY": {
      if (payload.type !== "EVENT_CHANGE_NOTIFY") throw new Error("notification_template_payload_mismatch");
      const { default: EventChangeEmail, getSubject } = await import("./templates/event-change");
      return {
        subject: getSubject(payload as any),
        html: await render(React.createElement(EventChangeEmail, payload as any)),
        text: await render(React.createElement(EventChangeEmail, payload as any), { plainText: true }),
      };
    }
    case "EVENT_REMINDER_24H": {
      if (payload.type !== "EVENT_REMINDER_24H") throw new Error("notification_template_payload_mismatch");
      const { default: EventReminder24hEmail, getSubject } = await import("./templates/event-reminder-24h");
      return {
        subject: getSubject(payload as any),
        html: await render(React.createElement(EventReminder24hEmail, payload as any)),
        text: await render(React.createElement(EventReminder24hEmail, payload as any), { plainText: true }),
      };
    }
    case "NEW_USER_WELCOME": {
      const { default: NewUserWelcomeEmail, getSubject } = await import("./templates/new-user-welcome");
      return {
        subject: getSubject(),
        html: await render(React.createElement(NewUserWelcomeEmail, payload as any)),
        text: await render(React.createElement(NewUserWelcomeEmail, payload as any), { plainText: true }),
      };
    }
    case "BROADCAST": {
      const { default: BroadcastEmail, getSubject } = await import("./templates/broadcast");
      return {
        subject: getSubject(payload as any),
        html: await render(React.createElement(BroadcastEmail, payload as any)),
        text: await render(React.createElement(BroadcastEmail, payload as any), { plainText: true }),
      };
    }
    case "ARTWORK_INQUIRY_BUYER": {
      if (payload.type !== "ARTWORK_INQUIRY_BUYER") throw new Error("notification_template_payload_mismatch");
      const { default: ArtworkInquiryBuyerEmail, getSubject } = await import("./templates/artwork-inquiry-buyer");
      return {
        subject: getSubject(payload as any),
        html: await render(React.createElement(ArtworkInquiryBuyerEmail, payload as any)),
        text: await render(React.createElement(ArtworkInquiryBuyerEmail, payload as any), { plainText: true }),
      };
    }
    case "ARTWORK_INQUIRY_ARTIST": {
      if (payload.type !== "ARTWORK_INQUIRY_ARTIST") throw new Error("notification_template_payload_mismatch");
      const { default: ArtworkInquiryArtistEmail, getSubject } = await import("./templates/artwork-inquiry-artist");
      return {
        subject: getSubject(payload as any),
        html: await render(React.createElement(ArtworkInquiryArtistEmail, payload as any)),
        text: await render(React.createElement(ArtworkInquiryArtistEmail, payload as any), { plainText: true }),
      };
    }
    case "ARTWORK_VIEW_MILESTONE":
      throw new Error(`template not yet implemented: ${type}`);
    default: {
      const exhaustiveType: never = type;
      throw new Error(`template not yet implemented: ${exhaustiveType}`);
    }
  }
}
