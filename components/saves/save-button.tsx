"use client";

import { Heart, FolderPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { buildLoginRedirectUrl } from "@/lib/auth-redirect";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collections, setCollections] = useState<Array<{ id: string; title: string }>>([]);
  const [newTitle, setNewTitle] = useState("");

  async function loadCollections() {
    const res = await fetch("/api/collections", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json() as { items?: Array<{ id: string; title: string }> };
    setCollections(data.items ?? []);
  }

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

  async function saveToCollection(collectionId: string) {
    await fetch(`/api/collections/${collectionId}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ entityType, entityId }),
    });
    setCollectionOpen(false);
  }

  async function createCollection() {
    if (!newTitle.trim()) return;
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), isPublic: true }),
    });
    if (!res.ok) return;
    const created = await res.json() as { id: string };
    await saveToCollection(created.id);
    setNewTitle("");
  }

  return (
    <>
      <div className="inline-flex items-center gap-2">
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
        {isAuthenticated ? (
          <button type="button" className="inline-flex items-center gap-1.5 rounded border border-border bg-background/90 px-3 py-1.5 text-sm" onClick={() => { setCollectionOpen(true); void loadCollections(); }}>
            <FolderPlus className="h-4 w-4" />
            Save to collection
          </button>
        ) : null}
      </div>

      <Dialog open={collectionOpen} onOpenChange={setCollectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save to collection</DialogTitle>
            <DialogDescription>Curate this item into an existing or new collection.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {collections.map((collection) => (
              <button key={collection.id} type="button" onClick={() => void saveToCollection(collection.id)} className="block w-full rounded border px-3 py-2 text-left text-sm hover:bg-muted/50">{collection.title}</button>
            ))}
            <div className="flex gap-2">
              <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="New collection title" className="h-9 flex-1 rounded border px-3 text-sm" />
              <button type="button" onClick={() => void createCollection()} className="rounded border px-3 text-sm">Create</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
