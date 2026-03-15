"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { enqueueToast } from "@/lib/toast";
import { Camera, ExternalLink, Loader2, Pencil, Plus, X } from "lucide-react";

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
  { key: "twitterUrl", label: "Twitter" },
  { key: "linkedinUrl", label: "LinkedIn" },
  { key: "tiktokUrl", label: "TikTok" },
  { key: "youtubeUrl", label: "YouTube" },
] as const;

type SocialKey = (typeof SOCIAL_FIELDS)[number]["key"];

type ArtistState = ArtistHeaderData;

export function ArtistProfileHeaderEditor({ artist }: { artist: ArtistHeaderData }) {
  const [data, setData] = useState<ArtistState>(artist);
  const [coverUploading, setCoverUploading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [socialSaving, setSocialSaving] = useState(false);
  const [zoneErrors, setZoneErrors] = useState<{ cover: string | null; avatar: string | null; profile: string | null; social: string | null }>({
    cover: null,
    avatar: null,
    profile: null,
    social: null,
  });

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(artist.name);

  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState(artist.bio ?? "");

  const [editingMediums, setEditingMediums] = useState(false);
  const [mediumsDraft, setMediumsDraft] = useState(artist.mediums);
  const [newMediumDraft, setNewMediumDraft] = useState("");

  const [editingField, setEditingField] = useState<SocialKey | null>(null);
  const [socialDraft, setSocialDraft] = useState("");

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const bioInputRef = useRef<HTMLTextAreaElement | null>(null);
  const socialInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  useEffect(() => {
    if (editingBio) bioInputRef.current?.focus();
  }, [editingBio]);

  useEffect(() => {
    if (editingField) socialInputRef.current?.focus();
  }, [editingField]);

  function setZoneError(zone: "cover" | "avatar" | "profile" | "social", message: string) {
    setZoneErrors((prev) => ({ ...prev, [zone]: message }));
    window.setTimeout(() => {
      setZoneErrors((prev) => ({ ...prev, [zone]: null }));
    }, 3000);
  }

  async function patchArtist(patch: Partial<ArtistHeaderData>) {
    const res = await fetch("/api/my/artist", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message ?? "Failed to save profile");
    }
  }

  async function onCoverFileSelected(file: File | null) {
    if (!file) return;
    setCoverUploading(true);

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("type", "cover");

      const res = await fetch("/api/my/artist/cover", { method: "POST", body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to update cover");

      const nextCoverUrl = body?.url ?? body?.coverUrl ?? body?.cover?.url ?? null;
      if (nextCoverUrl) {
        setData((prev) => ({ ...prev, coverUrl: nextCoverUrl }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update cover";
      setZoneError("cover", message);
      enqueueToast({ title: message, variant: "error" });
    } finally {
      setCoverUploading(false);
    }
  }

  async function onAvatarFileSelected(file: File | null) {
    if (!file) return;
    setAvatarUploading(true);

    try {
      const formData = new FormData();
      formData.set("file", file);

      const uploadRes = await fetch("/api/my/artist/images/upload", {
        method: "POST",
        body: formData,
      });
      const uploadBody = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) throw new Error(uploadBody?.error?.message ?? "Failed to upload avatar");

      const assetId = uploadBody?.assetId ?? uploadBody?.image?.assetId;
      const uploadedUrl = uploadBody?.url ?? uploadBody?.image?.url;
      if (!assetId) throw new Error("Upload did not return an asset id");

      await patchArtist({ featuredAssetId: assetId });
      setData((prev) => ({ ...prev, avatarUrl: uploadedUrl ?? prev.avatarUrl }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update avatar";
      setZoneError("avatar", message);
      enqueueToast({ title: message, variant: "error" });
    } finally {
      setAvatarUploading(false);
    }
  }

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === data.name) {
      setNameDraft(data.name);
      setEditingName(false);
      return;
    }

    setProfileSaving(true);
    try {
      await patchArtist({ name: trimmed });
      setData((prev) => ({ ...prev, name: trimmed }));
      setEditingName(false);
    } catch (error) {
      setZoneError("profile", error instanceof Error ? error.message : "Failed to save name");
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveBio() {
    const trimmed = bioDraft.trim();
    const nextBio = trimmed || null;
    if (nextBio === data.bio) {
      setEditingBio(false);
      return;
    }

    setProfileSaving(true);
    try {
      await patchArtist({ bio: nextBio });
      setData((prev) => ({ ...prev, bio: nextBio }));
      setEditingBio(false);
    } catch (error) {
      setZoneError("profile", error instanceof Error ? error.message : "Failed to save bio");
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveMediums() {
    setProfileSaving(true);
    try {
      await patchArtist({ mediums: mediumsDraft });
      setData((prev) => ({ ...prev, mediums: mediumsDraft }));
      setEditingMediums(false);
    } catch (error) {
      setZoneError("profile", error instanceof Error ? error.message : "Failed to save mediums");
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveSocialField(field: SocialKey, value: string) {
    const nextValue = value.trim() || null;
    if (nextValue === data[field]) {
      setEditingField(null);
      return;
    }

    setSocialSaving(true);
    try {
      await patchArtist({ [field]: nextValue });
      setData((prev) => ({ ...prev, [field]: nextValue }));
      setEditingField(null);
    } catch (error) {
      setZoneError("social", error instanceof Error ? error.message : `Failed to save ${field}`);
    } finally {
      setSocialSaving(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="group relative aspect-[16/5] min-h-24 bg-gradient-to-r from-indigo-500/50 via-fuchsia-500/40 to-cyan-400/40">
        {data.coverUrl ? <Image src={data.coverUrl} alt={`${data.name} cover`} fill className="object-cover" sizes="100vw" /> : null}
        <input
          ref={coverInputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            onCoverFileSelected(e.target.files?.[0] ?? null);
            e.currentTarget.value = "";
          }}
        />
        <button
          type="button"
          className="absolute inset-0 hidden items-center justify-center bg-black/40 text-sm text-white group-hover:flex"
          onClick={() => coverInputRef.current?.click()}
          disabled={coverUploading}
        >
          <span className="inline-flex items-center gap-2">{coverUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}Change cover</span>
        </button>
      </div>
      {zoneErrors.cover ? <p className="px-4 pt-2 text-xs text-red-600">{zoneErrors.cover}</p> : null}

      <div className="-mt-10 p-4 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex items-end gap-4">
            <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-background bg-muted md:h-24 md:w-24">
              {data.avatarUrl ? <Image src={data.avatarUrl} alt={data.name} fill className="object-cover" sizes="96px" /> : <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>}
              <input
                ref={avatarInputRef}
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  onAvatarFileSelected(e.target.files?.[0] ?? null);
                  e.currentTarget.value = "";
                }}
              />
              <button
                type="button"
                className="absolute inset-0 hidden items-center justify-center bg-black/40 text-center text-xs text-white group-hover:flex"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
              >
                {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Change photo"}
              </button>
            </div>

            <div className="space-y-2">
              <div className="group/name inline-flex items-center gap-2">
                {editingName ? (
                  <input
                    ref={nameInputRef}
                    className="h-10 rounded-md border border-input bg-background px-3 text-2xl font-semibold"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={saveName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") {
                        setNameDraft(data.name);
                        setEditingName(false);
                      }
                    }}
                  />
                ) : (
                  <button type="button" className="inline-flex items-center gap-2" onClick={() => setEditingName(true)}>
                    <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{data.name}</h1>
                    {profileSaving ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Pencil className="hidden h-4 w-4 text-muted-foreground group-hover/name:block" />}
                  </button>
                )}
              </div>

              <div className="group/bio max-w-2xl">
                {editingBio ? (
                  <textarea
                    ref={bioInputRef}
                    rows={4}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={bioDraft}
                    onChange={(e) => setBioDraft(e.target.value)}
                    onBlur={saveBio}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setBioDraft(data.bio ?? "");
                        setEditingBio(false);
                      }
                    }}
                  />
                ) : (
                  <button type="button" className="inline-flex items-center gap-2 text-left" onClick={() => setEditingBio(true)}>
                    <p className="text-sm text-muted-foreground">{data.bio || "Click to add bio…"}</p>
                    {profileSaving ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Pencil className="hidden h-4 w-4 text-muted-foreground group-hover/bio:block" />}
                  </button>
                )}
              </div>

              <div>
                <button type="button" className="group/mediums inline-flex flex-wrap items-center gap-2" onClick={() => setEditingMediums(true)}>
                  {data.mediums.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                  {data.mediums.length === 0 ? <span className="text-xs text-muted-foreground">Click to add mediums</span> : null}
                  {profileSaving ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Pencil className="hidden h-4 w-4 text-muted-foreground group-hover/mediums:block" />}
                </button>

                {editingMediums ? (
                  <div className="mt-2 space-y-2 rounded-md border border-dashed p-3">
                    <input
                      className="h-9 w-full rounded-md border border-input px-3 text-sm"
                      placeholder="Add a medium and press Enter"
                      value={newMediumDraft}
                      onChange={(e) => setNewMediumDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        const next = newMediumDraft.trim();
                        if (!next) return;
                        if (mediumsDraft.includes(next)) return;
                        setMediumsDraft((prev) => [...prev, next]);
                        setNewMediumDraft("");
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      {mediumsDraft.map((tag) => (
                        <Badge key={tag} variant="secondary" className="inline-flex items-center gap-1">
                          {tag}
                          <button type="button" aria-label={`Remove ${tag}`} onClick={() => setMediumsDraft((prev) => prev.filter((item) => item !== tag))}>
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={saveMediums} disabled={profileSaving}>Save</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => {
                        setMediumsDraft(data.mediums);
                        setEditingMediums(false);
                        setNewMediumDraft("");
                      }}>Cancel</Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {zoneErrors.avatar || zoneErrors.profile ? <p className="mt-2 text-xs text-red-600">{zoneErrors.avatar ?? zoneErrors.profile}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
          {SOCIAL_FIELDS.map((field) => {
            const value = data[field.key];
            const isEditing = editingField === field.key;
            return (
              <div key={field.key}>
                {isEditing ? (
                  <input
                    ref={socialInputRef}
                    className="h-8 rounded-md border border-input px-2 text-xs"
                    value={socialDraft}
                    placeholder={`https://… ${field.label}`}
                    onChange={(e) => setSocialDraft(e.target.value)}
                    onBlur={() => saveSocialField(field.key, socialDraft)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveSocialField(field.key, socialDraft);
                      if (e.key === "Escape") setEditingField(null);
                    }}
                  />
                ) : value ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-foreground hover:underline"
                    onClick={() => {
                      setSocialDraft(value);
                      setEditingField(field.key);
                    }}
                  >
                    {field.label}
                    <ExternalLink className="h-3 w-3" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                    onClick={() => {
                      setSocialDraft("");
                      setEditingField(field.key);
                    }}
                  >
                    <Plus className="h-3 w-3" /> Add {field.label}
                  </button>
                )}
              </div>
            );
          })}
          {socialSaving ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </div>
        {zoneErrors.social ? <p className="mt-2 text-xs text-red-600">{zoneErrors.social}</p> : null}
      </div>
    </section>
  );
}
