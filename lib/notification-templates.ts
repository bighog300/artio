import { NotificationType } from "@prisma/client";
import { inviteCreatedDedupeKey, submissionDecisionDedupeKey, submissionSubmittedDedupeKey } from "@/lib/notification-keys";

export type NotificationTemplatePayload =
  | {
      type: "INVITE_CREATED";
      inviteId: string;
      inviteToken?: string | null;
      venueId?: string | null;
      role?: string | null;
    }
  | {
      type: "SUBMISSION_SUBMITTED";
      submissionId: string;
      submissionType?: "EVENT" | "VENUE" | "ARTIST" | "ARTWORK";
      targetVenueId?: string | null;
      targetArtistId?: string | null;
    }
  | {
      type: "SUBMISSION_APPROVED";
      submissionId: string;
      submissionType?: "EVENT" | "VENUE" | "ARTIST" | "ARTWORK";
      targetEventSlug?: string | null;
      targetVenueSlug?: string | null;
      targetArtistSlug?: string | null;
    }
  | {
      type: "SUBMISSION_REJECTED";
      submissionId: string;
      submissionType?: "EVENT" | "VENUE" | "ARTIST" | "ARTWORK";
      targetVenueId?: string | null;
      targetArtistId?: string | null;
      decisionReason?: string | null;
    }
  | {
      type: "SAVED_SEARCH_MATCH";
      savedSearchId: string;
      eventId: string;
      searchName: string;
      eventTitle: string;
      eventSlug?: string | null;
    }
  | {
      type: "VENUE_CLAIM_VERIFY";
      venueName: string;
      verifyUrl: string;
      venueSlug: string;
      expiresAt: string;
    }
  | {
      type: "VENUE_CLAIM_APPROVED";
      venueSlug: string;
    }
  | {
      type: "VENUE_CLAIM_REJECTED";
      venueSlug: string;
      reason?: string | null;
    }
  | {
      type: "RSVP_CONFIRMED";
      eventTitle: string;
      venueName: string;
      eventSlug: string;
      startAt: string;
      venueAddress?: string | null;
      confirmationCode: string;
    }
  | {
      type: "RSVP_CANCELLED";
      eventTitle: string;
      confirmationCode: string;
      reason?: string | null;
      eventSlug?: string | null;
    }
  | {
      type: "WAITLIST_PROMOTED";
      eventTitle: string;
      eventSlug: string;
      guestName: string;
      registrationId: string;
    }
  | {
      type: "EVENT_CHANGE_NOTIFY";
      eventTitle: string;
      eventSlug: string;
      changeDescription?: string | null;
    }
  | {
      type: "EVENT_REMINDER_24H";
      eventTitle: string;
      eventSlug: string;
      startAt: string;
      venueName: string;
      venueAddress?: string | null;
    }
  | {
      type: "ARTWORK_INQUIRY_BUYER";
      artworkTitle: string;
      artworkSlug: string;
      artistName: string;
      priceFormatted?: string | null;
      inquiryId: string;
    }
  | {
      type: "ARTWORK_INQUIRY_ARTIST";
      artworkTitle: string;
      artworkSlug: string;
      buyerName: string;
      buyerEmail: string;
      message?: string | null;
      priceFormatted?: string | null;
      inquiryId: string;
    };

const WAITLIST_PROMOTED_TYPE = "WAITLIST_PROMOTED" as NotificationType;

export function buildNotification({ type, payload }: { type: NotificationType; payload: NotificationTemplatePayload }) {
  if (type === "INVITE_CREATED" && payload.type === "INVITE_CREATED") {
    const href = payload.inviteToken ? `/invite/${payload.inviteToken}` : payload.venueId ? `/my/venues/${payload.venueId}` : undefined;
    return {
      title: "You've been invited to manage a venue",
      body: `You were invited as ${(payload.role ?? "editor").toLowerCase()} to collaborate on a venue.`,
      href,
      dedupeKey: inviteCreatedDedupeKey(payload.inviteId),
    };
  }

  if (type === "SUBMISSION_SUBMITTED" && payload.type === "SUBMISSION_SUBMITTED") {
    const href = payload.submissionType === "VENUE" && payload.targetVenueId
      ? `/my/venues/${payload.targetVenueId}`
      : payload.submissionType === "ARTIST"
        ? "/my/artist"
        : "/my/venues";
    return {
      title: "Submission sent for review",
      body: payload.submissionType === "VENUE" ? "Your venue submission is now pending moderation." : "Your event submission is now pending moderation.",
      href,
      dedupeKey: submissionSubmittedDedupeKey(payload.submissionId),
    };
  }

  if (type === "SUBMISSION_APPROVED" && payload.type === "SUBMISSION_APPROVED") {
    const href = payload.submissionType === "EVENT" && payload.targetEventSlug
      ? `/events/${payload.targetEventSlug}`
      : payload.submissionType === "VENUE" && payload.targetVenueSlug
        ? `/venues/${payload.targetVenueSlug}`
        : payload.submissionType === "ARTIST" && payload.targetArtistSlug
          ? `/artists/${payload.targetArtistSlug}`
          : undefined;

    return {
      title: "Submission approved",
      body: "Your submission has been approved and published.",
      href,
      dedupeKey: submissionDecisionDedupeKey(payload.submissionId, "APPROVED"),
    };
  }

  if (type === "SUBMISSION_REJECTED" && payload.type === "SUBMISSION_REJECTED") {
    const href = payload.submissionType === "EVENT" && payload.targetVenueId
      ? `/my/venues/${payload.targetVenueId}/submit-event`
      : payload.submissionType === "VENUE" && payload.targetVenueId
        ? `/my/venues/${payload.targetVenueId}`
        : payload.submissionType === "ARTIST" && payload.targetArtistId
          ? "/my/artist"
          : undefined;

    return {
      title: "Submission needs changes",
      body: payload.decisionReason ?? "Your submission was rejected by moderation.",
      href,
      dedupeKey: submissionDecisionDedupeKey(payload.submissionId, "REJECTED"),
    };
  }

  if (type === "SAVED_SEARCH_MATCH" && payload.type === "SAVED_SEARCH_MATCH") {
    return {
      title: "New event matches your saved search",
      body: `${payload.eventTitle} matches your saved search "${payload.searchName}".`,
      href: payload.eventSlug ? `/events/${payload.eventSlug}` : undefined,
      dedupeKey: `saved-search-match:${payload.savedSearchId}:${payload.eventId}`,
    };
  }

  if (type === "VENUE_CLAIM_VERIFY" && payload.type === "VENUE_CLAIM_VERIFY") {
    return {
      title: "Verify venue claim",
      body: `Confirm ownership for @${payload.venueSlug} before the link expires.`,
      href: payload.verifyUrl,
      dedupeKey: `venue-claim:${payload.venueSlug}:verify:${payload.expiresAt}`,
    };
  }

  if (type === "VENUE_CLAIM_APPROVED" && payload.type === "VENUE_CLAIM_APPROVED") {
    return {
      title: "Venue claim approved",
      body: `Your claim for @${payload.venueSlug} has been approved.`,
      href: `/venues/${payload.venueSlug}`,
      dedupeKey: `venue-claim:${payload.venueSlug}:approved`,
    };
  }

  if (type === "VENUE_CLAIM_REJECTED" && payload.type === "VENUE_CLAIM_REJECTED") {
    return {
      title: "Venue claim rejected",
      body: payload.reason ?? `Your claim for @${payload.venueSlug} was rejected.`,
      href: `/venues/${payload.venueSlug}`,
      dedupeKey: `venue-claim:${payload.venueSlug}:rejected`,
    };
  }


  if (type === "RSVP_CONFIRMED" && payload.type === "RSVP_CONFIRMED") {
    return {
      title: `RSVP confirmed: ${payload.eventTitle}`,
      body: `Your RSVP is confirmed. Code: ${payload.confirmationCode}`,
      href: `/events/${payload.eventSlug}`,
      dedupeKey: `rsvp-confirmed:${payload.eventSlug}:${payload.confirmationCode}`,
    };
  }

  if (type === "RSVP_CANCELLED" && payload.type === "RSVP_CANCELLED") {
    return {
      title: `RSVP cancelled: ${payload.eventTitle}`,
      body: payload.reason ?? `Your RSVP has been cancelled. Code: ${payload.confirmationCode}`,
      href: payload.eventSlug ? `/events/${payload.eventSlug}` : undefined,
      dedupeKey: `rsvp-cancelled:${payload.confirmationCode}`,
    };
  }

  if (type === WAITLIST_PROMOTED_TYPE && payload.type === "WAITLIST_PROMOTED") {
    return {
      title: `Good news — a spot has opened up for ${payload.eventTitle}`,
      body: `Great news, ${payload.guestName}. You've been promoted from the waitlist and your registration is now confirmed.`,
      href: `/events/${payload.eventSlug}`,
      dedupeKey: `waitlist-promoted:${payload.registrationId}`,
    };
  }

  if (type === "EVENT_CHANGE_NOTIFY" && payload.type === "EVENT_CHANGE_NOTIFY") {
    return {
      title: `${payload.eventTitle} was updated`,
      body: payload.changeDescription ?? "The event has new details. Please review before attending.",
      href: `/events/${payload.eventSlug}`,
      dedupeKey: `event-change:${payload.eventSlug}`,
    };
  }

  if (type === "EVENT_REMINDER_24H" && payload.type === "EVENT_REMINDER_24H") {
    return {
      title: `Reminder: ${payload.eventTitle} is tomorrow`,
      body: `${payload.eventTitle} starts within 24 hours.`,
      href: `/events/${payload.eventSlug}`,
      dedupeKey: `event-reminder-24h:${payload.eventSlug}:${payload.startAt}`,
    };
  }


  if (type === "ARTWORK_INQUIRY_BUYER" && payload.type === "ARTWORK_INQUIRY_BUYER") {
    return {
      title: "Artwork enquiry sent",
      body: `Your enquiry for ${payload.artworkTitle} has been sent to ${payload.artistName}.`,
      href: `/artwork/${payload.artworkSlug}`,
      dedupeKey: `artwork-inquiry:${payload.inquiryId}:buyer`,
    };
  }

  if (type === "ARTWORK_INQUIRY_ARTIST" && payload.type === "ARTWORK_INQUIRY_ARTIST") {
    return {
      title: `New enquiry for ${payload.artworkTitle}`,
      body: `${payload.buyerName} is interested in ${payload.artworkTitle}.`,
      href: `/artwork/${payload.artworkSlug}`,
      dedupeKey: `artwork-inquiry:${payload.inquiryId}:artist`,
    };
  }

  throw new Error("notification_template_payload_mismatch");
}
