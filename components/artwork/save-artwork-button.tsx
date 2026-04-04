"use client";

import { SaveButton } from "@/components/saves/save-button";

type SaveArtworkButtonProps = {
  artworkId: string;
  initialSaved: boolean;
  signedIn: boolean;
};

export function SaveArtworkButton({ artworkId, initialSaved, signedIn }: SaveArtworkButtonProps) {
  return <SaveButton entityType="ARTWORK" entityId={artworkId} initialSaved={initialSaved} isAuthenticated={signedIn} nextUrl={`/artwork/${artworkId}`} />;
}
