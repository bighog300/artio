"use client";

import { SaveButton } from "@/components/saves/save-button";

type SaveEventButtonProps = {
  eventId: string;
  initialSaved: boolean;
  nextUrl: string;
  isAuthenticated: boolean;
  analytics?: { eventSlug?: string; ui?: string };
};

export function SaveEventButton({ eventId, initialSaved, nextUrl, isAuthenticated }: SaveEventButtonProps) {
  return <SaveButton entityType="EVENT" entityId={eventId} initialSaved={initialSaved} isAuthenticated={isAuthenticated} nextUrl={nextUrl} />;
}
