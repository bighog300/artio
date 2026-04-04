"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { buildLoginRedirectUrl } from "@/lib/auth-redirect";

export type SaveEntityType = "EVENT" | "ARTIST" | "VENUE" | "ARTWORK";

type SaveButtonProps = {
  entityType: SaveEntityType;
  entityId: string;
  initialSaved: boolean;
  isAuthenticated: boolean;
  nextUrl: string;
  className?: string;
};

const STORAGE_KEY = "artio:saved-items";

function readLocalSaved(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalSaved(items: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function SaveButton({ entityType, entityId, initialSaved, isAuthenticated, nextUrl, className }: SaveButtonProps) {
  const router = useRouter();
  const localKey = useMemo(() => `${entityType}:${entityId}`, [entityId, entityType]);
  const localInitiallySaved = typeof window !== "undefined" ? readLocalSaved().includes(localKey) : false;
  const [saved, setSaved] = useState(initialSaved || localInitiallySaved);
  const [pending, setPending] = useState(false);

  async function onToggle() {
    if (pending) return;
    const nextSaved = !saved;
    setSaved(nextSaved);

    if (!isAuthenticated) {
      const current = new Set(readLocalSaved());
      if (nextSaved) current.add(localKey);
      else current.delete(localKey);
      writeLocalSaved(Array.from(current));
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/favorites", {
        method: nextSaved ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType: entityType, targetId: entityId }),
      });
      if (res.status === 401) {
        router.push(buildLoginRedirectUrl(nextUrl));
        setSaved(!nextSaved);
        return;
      }
      if (!res.ok) setSaved(!nextSaved);
    } catch {
      setSaved(!nextSaved);
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
      className={className ?? "inline-flex items-center gap-1.5 rounded border border-border bg-background/90 px-3 py-1.5 text-sm"}
    >
      <Heart className={`h-4 w-4 ${saved ? "fill-current text-rose-500" : ""}`} />
      {saved ? "Saved" : "Save"}
    </button>
  );
}
