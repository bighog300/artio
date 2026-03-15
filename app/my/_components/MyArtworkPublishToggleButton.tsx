"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { buildLoginRedirectUrl } from "@/lib/auth-redirect";
import { enqueueToast } from "@/lib/toast";

export async function requestArtworkPublishToggle(
  artworkId: string,
  isPublished: boolean,
  fetchImpl: typeof fetch = fetch,
) {
  return fetchImpl(`/api/my/artwork/${artworkId}/publish`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ isPublished: !isPublished }),
  });
}

export function MyArtworkPublishToggleButton({
  artworkId,
  initialIsPublished,
  status,
}: {
  artworkId: string;
  initialIsPublished: boolean;
  status?: string;
}) {
  const router = useRouter();
  const [isPublished, setIsPublished] = useState(initialIsPublished);
  const [busy, setBusy] = useState(false);

  if (status === "IN_REVIEW") {
    return (
      <Button type="button" variant="secondary" size="sm" disabled>
        In review
      </Button>
    );
  }

  async function onToggle() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await requestArtworkPublishToggle(artworkId, isPublished);
      if (res.status === 401) {
        enqueueToast({ title: "Please log in", variant: "error" });
        window.location.href = buildLoginRedirectUrl("/my/artwork");
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        enqueueToast({ title: body?.message ?? body?.error ?? "Unable to update publish status", variant: "error" });
        return;
      }
      const nextIsPublished = !isPublished;
      setIsPublished(nextIsPublished);
      enqueueToast({ title: nextIsPublished ? "Published" : "Unpublished", variant: "success" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void onToggle()}>
      {busy ? "Working..." : isPublished ? "Unpublish" : "Publish"}
    </Button>
  );
}
