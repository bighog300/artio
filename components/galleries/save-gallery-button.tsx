"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { buildLoginRedirectUrl } from "@/lib/auth-redirect";

export function SaveGalleryButton({
  galleryId,
  initialSaved,
  signedIn,
  nextUrl,
}: {
  galleryId: string;
  initialSaved: boolean;
  signedIn: boolean;
  nextUrl: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  async function onToggle() {
    if (pending) return;
    if (!signedIn) {
      router.push(buildLoginRedirectUrl(nextUrl));
      return;
    }

    const next = !saved;
    setSaved(next);
    setPending(true);
    try {
      const res = await fetch(`/api/collections/${galleryId}/follow`, {
        method: next ? "POST" : "DELETE",
      });
      if (!res.ok) setSaved(!next);
    } catch {
      setSaved(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onToggle()}
      disabled={pending}
      aria-pressed={saved}
      className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
    >
      <Heart className={`h-4 w-4 ${saved ? "fill-current text-rose-500" : ""}`} />
      {saved ? "Saved" : "Save gallery"}
    </button>
  );
}
