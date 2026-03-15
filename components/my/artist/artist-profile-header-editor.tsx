"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { enqueueToast } from "@/lib/toast";

type ArtistHeaderData = {
  id: string;
  name: string;
  bio: string | null;
  mediums: string[];
  websiteUrl: string | null;
  instagramUrl: string | null;
  twitterUrl: string | null;
  linkedinUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  coverUrl: string | null;
  avatarUrl: string | null;
};

const SOCIAL_FIELDS = [
  { key: "websiteUrl", label: "Website" },
  { key: "instagramUrl", label: "Instagram" },
  { key: "twitterUrl", label: "Twitter / X" },
  { key: "linkedinUrl", label: "LinkedIn" },
  { key: "tiktokUrl", label: "TikTok" },
  { key: "youtubeUrl", label: "YouTube" },
] as const;

type SocialKey = (typeof SOCIAL_FIELDS)[number]["key"];

async function patchArtist(data: Record<string, unknown>) {
  const res = await fetch("/api/my/artist", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? "Save failed");
  }
  return res.json();
}

export function ArtistProfileHeaderEditor({ artist: initial }: { artist: ArtistHeaderData }) {
  const [artist, setArtist] = useState(initial);

  // Cover upload
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Avatar upload
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Name editing
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(artist.name);
  const [savingName, setSavingName] = useState(false);

  // Bio editing
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState(artist.bio ?? "");
  const [savingBio, setSavingBio] = useState(false);

  // Mediums editing
  const [editingMediums, setEditingMediums] = useState(false);
  const [mediumsDraft, setMediumsDraft] = useState<string[]>(artist.mediums);
  const [mediumInput, setMediumInput] = useState("");
  const [savingMediums, setSavingMediums] = useState(false);

  // Social editing
  const [editingField, setEditingField] = useState<SocialKey | null>(null);
  const [socialDraft, setSocialDraft] = useState("");
  const [savingSocial, setSavingSocial] = useState(false);

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "cover");
      const res = await fetch("/api/my/artist/cover", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setArtist((a) => ({ ...a, coverUrl: data.url ?? a.coverUrl }));
      enqueueToast({ title: "Cover updated", variant: "success" });
    } catch (err) {
      enqueueToast({ title: err instanceof Error ? err.message : "Upload failed", variant: "error" });
    } finally {
      setUploadingCover(false);
      e.target.value = "";
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/my/artist/images/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      if (data.assetId) {
        await patchArtist({ featuredAssetId: data.assetId });
      }
      setArtist((a) => ({ ...a, avatarUrl: data.url ?? a.avatarUrl }));
      enqueueToast({ title: "Photo updated", variant: "success" });
    } catch (err) {
      enqueueToast({ title: err instanceof Error ? err.message : "Upload failed", variant: "error" });
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  }

  async function saveName() {
    if (nameDraft.trim() === artist.name) { setEditingName(false); return; }
    setSavingName(true);
    try {
      await patchArtist({ name: nameDraft.trim() });
      setArtist((a) => ({ ...a, name: nameDraft.trim() }));
      setEditingName(false);
    } catch (err) {
      enqueueToast({ title: err instanceof Error ? err.message : "Save failed", variant: "error" });
    } finally {
      setSavingName(false);
    }
  }

  async function saveBio() {
    const value = bioDraft.trim() || null;
    if (value === artist.bio) { setEditingBio(false); return; }
    setSavingBio(true);
    try {
      await patchArtist({ bio: value });
      setArtist((a) => ({ ...a, bio: value }));
      setEditingBio(false);
    } catch (err) {
      enqueueToast({ title: err instanceof Error ? err.message : "Save failed", variant: "error" });
    } finally {
      setSavingBio(false);
    }
  }

  async function saveMediums() {
    setSavingMediums(true);
    try {
      await patchArtist({ mediums: mediumsDraft });
      setArtist((a) => ({ ...a, mediums: mediumsDraft }));
      setEditingMediums(false);
    } catch (err) {
      enqueueToast({ title: err instanceof Error ? err.message : "Save failed", variant: "error" });
    } finally {
      setSavingMediums(false);
    }
  }

  function addMedium() {
    const val = mediumInput.trim();
    if (val && !mediumsDraft.includes(val)) {
      setMediumsDraft((m) => [...m, val]);
    }
    setMediumInput("");
  }

  async function saveSocial() {
    if (!editingField) return;
    setSavingSocial(true);
    try {
      await patchArtist({ [editingField]: socialDraft.trim() || null });
      setArtist((a) => ({ ...a, [editingField]: socialDraft.trim() || null }));
      setEditingField(null);
    } catch (err) {
      enqueueToast({ title: err instanceof Error ? err.message : "Save failed", variant: "error" });
    } finally {
      setSavingSocial(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* Cover zone */}
      <div className="group relative aspect-[16/5] min-h-24 bg-gradient-to-r from-indigo-500/50 via-fuchsia-500/40 to-cyan-400/40 cursor-pointer"
        onClick={() => coverInputRef.current?.click()}>
        {artist.coverUrl
          ? <Image src={artist.coverUrl} alt="Cover" fill className="object-cover" sizes="100vw" />
          : null}
        <div className="absolute inset-0 hidden group-hover:flex flex-col items-center justify-center bg-black/40 text-white gap-1">
          {uploadingCover
            ? <span className="text-sm">Uploading…</span>
            : <><span className="text-2xl">📷</span><span className="text-sm font-medium">Change cover</span></>}
        </div>
        <input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleCoverUpload} />
      </div>

      {/* Profile info zone */}
      <div className="-mt-10 p-4 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex items-end gap-4">
            {/* Avatar zone */}
            <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-background bg-muted cursor-pointer md:h-24 md:w-24"
              onClick={() => avatarInputRef.current?.click()}>
              {artist.avatarUrl
                ? <Image src={artist.avatarUrl} alt={artist.name} fill className="object-cover" sizes="96px" />
                : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No photo</div>}
              <div className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/40 text-white text-xs font-medium rounded-full">
                {uploadingAvatar ? "…" : "Edit"}
              </div>
              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />
            </div>

            {/* Name + bio + mediums */}
            <div className="space-y-2 min-w-0">
              {/* Name */}
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    className="text-2xl font-semibold rounded border px-1 bg-background w-full max-w-xs"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={() => void saveName()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveName();
                      if (e.key === "Escape") { setNameDraft(artist.name); setEditingName(false); }
                    }}
                  />
                  {savingName && <span className="text-xs text-muted-foreground">Saving…</span>}
                </div>
              ) : (
                <h1
                  className="group/name flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl cursor-pointer"
                  onClick={() => { setNameDraft(artist.name); setEditingName(true); }}
                >
                  {artist.name}
                  <span className="hidden group-hover/name:inline text-sm text-muted-foreground">✏️</span>
                </h1>
              )}

              {/* Bio */}
              {editingBio ? (
                <div className="space-y-1">
                  <textarea
                    autoFocus
                    className="w-full rounded border p-2 text-sm bg-background min-w-[280px]"
                    rows={4}
                    value={bioDraft}
                    onChange={(e) => setBioDraft(e.target.value)}
                    onBlur={() => void saveBio()}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { setBioDraft(artist.bio ?? ""); setEditingBio(false); }
                      if (e.key === "Enter" && e.metaKey) void saveBio();
                    }}
                  />
                  {savingBio && <span className="text-xs text-muted-foreground">Saving…</span>}
                </div>
              ) : (
                <p
                  className="group/bio text-sm text-muted-foreground cursor-pointer flex items-start gap-1"
                  onClick={() => { setBioDraft(artist.bio ?? ""); setEditingBio(true); }}
                >
                  {artist.bio ?? <span className="italic">Click to add bio…</span>}
                  <span className="hidden group-hover/bio:inline shrink-0">✏️</span>
                </p>
              )}

              {/* Mediums */}
              {editingMediums ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {mediumsDraft.map((m) => (
                      <span key={m} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
                        {m}
                        <button type="button" onClick={() => setMediumsDraft((d) => d.filter((x) => x !== m))}>×</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      className="rounded border px-2 py-1 text-sm"
                      placeholder="Add medium…"
                      value={mediumInput}
                      onChange={(e) => setMediumInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMedium(); } }}
                    />
                    <Button size="sm" type="button" onClick={addMedium}>Add</Button>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void saveMediums()} disabled={savingMediums}>
                      {savingMediums ? "Saving…" : "Save"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setMediumsDraft(artist.mediums); setEditingMediums(false); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="group/mediums flex flex-wrap gap-1 cursor-pointer items-center"
                  onClick={() => { setMediumsDraft(artist.mediums); setEditingMediums(true); }}
                >
                  {artist.mediums.length > 0
                    ? artist.mediums.slice(0, 6).map((m) => <Badge key={m} variant="secondary">{m}</Badge>)
                    : <span className="text-xs italic text-muted-foreground">Add mediums…</span>}
                  <span className="hidden group-hover/mediums:inline text-sm text-muted-foreground ml-1">✏️</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Social links row */}
        <div className="mt-4 flex flex-wrap gap-3">
          {SOCIAL_FIELDS.map(({ key, label }) => {
            const value = artist[key];
            if (editingField === key) {
              return (
                <div key={key} className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">{label}:</span>
                  <input
                    autoFocus
                    className="rounded border px-2 py-0.5 text-xs w-48"
                    value={socialDraft}
                    onChange={(e) => setSocialDraft(e.target.value)}
                    onBlur={() => void saveSocial()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveSocial();
                      if (e.key === "Escape") setEditingField(null);
                    }}
                  />
                  {savingSocial && <span className="text-xs text-muted-foreground">…</span>}
                </div>
              );
            }
            return value ? (
              <button
                key={key}
                type="button"
                className="text-xs underline text-muted-foreground hover:text-foreground"
                onClick={() => { setSocialDraft(value); setEditingField(key); }}
              >
                {label} ✏️
              </button>
            ) : (
              <button
                key={key}
                type="button"
                className="text-xs text-muted-foreground/50 hover:text-muted-foreground"
                onClick={() => { setSocialDraft(""); setEditingField(key); }}
              >
                + {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
