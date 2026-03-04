"use client";

import { useState } from "react";

export function ArtistBio({ bio }: { bio: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = bio.length > 200;

  return (
    <div className="space-y-1">
      <p className={isLong && !expanded ? "line-clamp-3" : undefined}>{bio}</p>
      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-sm text-muted-foreground underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}
