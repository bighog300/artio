import { NotificationType } from "@prisma/client";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NotificationTemplatePayload } from "@/lib/notification-templates";

type RenderedEmail = { subject: string; html: string; text: string };

async function renderAsync(element: ReactElement, options?: { plainText?: boolean }) {
  const html = renderToStaticMarkup(element);
  if (!options?.plainText) {
    return html;
  }

  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function renderTemplate(
  component: (props: any) => ReactElement,
  payload: unknown,
  getSubject: (payload: any) => string,
): Promise<RenderedEmail> {
  const element = createElement(component, payload);

  return {
    subject: getSubject(payload),
    html: await renderAsync(element),
    text: await renderAsync(element, { plainText: true }),
  };
}

export async function renderEmailTemplate(type: NotificationType, payload: NotificationTemplatePayload): Promise<RenderedEmail> {
  switch (type) {
    case "INVITE_CREATED": {
      if (payload.type !== "INVITE_CREATED") throw new Error("notification_template_payload_mismatch");
      const { VenueInviteEmail, getSubject } = await import("./templates/venue-invite");
      return renderTemplate(VenueInviteEmail, payload, getSubject);
    }
    case "SUBMISSION_SUBMITTED": {
      if (payload.type !== "SUBMISSION_SUBMITTED") throw new Error("notification_template_payload_mismatch");
      const { SubmissionSubmittedEmail, getSubject } = await import("./templates/submission-submitted");
      return renderTemplate(SubmissionSubmittedEmail, payload, getSubject);
    }
    case "SUBMISSION_APPROVED": {
      if (payload.type !== "SUBMISSION_APPROVED") throw new Error("notification_template_payload_mismatch");
      const { SubmissionApprovedEmail, getSubject } = await import("./templates/submission-approved");
      return renderTemplate(SubmissionApprovedEmail, payload, getSubject);
    }
    case "SUBMISSION_REJECTED": {
      if (payload.type !== "SUBMISSION_REJECTED") throw new Error("notification_template_payload_mismatch");
      const { SubmissionRejectedEmail, getSubject } = await import("./templates/submission-rejected");
      return renderTemplate(SubmissionRejectedEmail, payload, getSubject);
    }
    case "SAVED_SEARCH_MATCH": {
      if (payload.type !== "SAVED_SEARCH_MATCH") throw new Error("notification_template_payload_mismatch");
      const { SavedSearchMatchEmail, getSubject } = await import("./templates/saved-search-match");
      return renderTemplate(SavedSearchMatchEmail, payload, getSubject);
    }
    case "DIGEST_READY": {
      const { default: WeeklyDigestEmail, getSubject } = await import("./templates/weekly-digest");
      return renderTemplate(WeeklyDigestEmail, payload, getSubject);
    }
    case "VENUE_CLAIM_VERIFY": {
      const { default: VenueClaimVerifyEmail, getSubject } = await import("./templates/venue-claim-verify");
      return renderTemplate(VenueClaimVerifyEmail, payload, getSubject);
    }
    case "VENUE_CLAIM_APPROVED": {
      const { default: VenueClaimApprovedEmail, getSubject } = await import("./templates/venue-claim-approved");
      return renderTemplate(VenueClaimApprovedEmail, payload, getSubject);
    }
    case "VENUE_CLAIM_REJECTED": {
      const { default: VenueClaimRejectedEmail, getSubject } = await import("./templates/venue-claim-rejected");
      return renderTemplate(VenueClaimRejectedEmail, payload, getSubject);
    }
    case "RSVP_CONFIRMED": {
      const { default: RsvpConfirmationEmail, getSubject } = await import("./templates/rsvp-confirmation");
      return renderTemplate(RsvpConfirmationEmail, payload, getSubject);
    }
    case "RSVP_CANCELLED": {
      const { default: RsvpCancellationEmail, getSubject } = await import("./templates/rsvp-cancellation");
      return renderTemplate(RsvpCancellationEmail, payload, getSubject);
    }
    case "EVENT_CHANGE_NOTIFY": {
      const { default: EventChangeEmail, getSubject } = await import("./templates/event-change");
      return renderTemplate(EventChangeEmail, payload, getSubject);
    }
    case "EVENT_REMINDER_24H": {
      const { default: EventReminder24hEmail, getSubject } = await import("./templates/event-reminder-24h");
      return renderTemplate(EventReminder24hEmail, payload, getSubject);
    }
    case "NEW_USER_WELCOME": {
      const { default: NewUserWelcomeEmail, getSubject } = await import("./templates/new-user-welcome");
      return renderTemplate(NewUserWelcomeEmail, payload, getSubject);
    }
    case "ARTWORK_VIEW_MILESTONE":
    case "BROADCAST":
      throw new Error(`template not yet implemented: ${type}`);
    default: {
      const exhaustiveType: never = type;
      throw new Error(`template not yet implemented: ${exhaustiveType}`);
    }
  }
}
