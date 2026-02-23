"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { enqueueToast } from "@/lib/toast";

type Props = {
  eventId: string;
  featuredAssetId: string | null;
  featuredImageUrl: string | null;
};

type UploadResult = { assetId: string; url: string };

export function FeaturedEventImagePanel({ eventId, featuredAssetId, featuredImageUrl }: Props) {
  const router = useRouter();
  const [imageUrl, setImageUrl] = useState<string | null>(featuredImageUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  async function patchFeaturedAsset(nextAssetId: string | null) {
    const res = await fetch(`/api/my/events/${eventId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ featuredAssetId: nextAssetId }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error?.message || "Failed to update featured image");
    }
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.set("file", file);
      const uploadRes = await fetch("/api/uploads/image", { method: "POST", body: formData });
      if (!uploadRes.ok) {
        const body = await uploadRes.json().catch(() => ({}));
        throw new Error(body?.error?.message || "Image upload failed");
      }

      const uploaded = await uploadRes.json() as UploadResult;
      await patchFeaturedAsset(uploaded.assetId);
      setImageUrl(uploaded.url);
      enqueueToast({ title: "Featured image updated", variant: "success" });
      router.refresh();
    } catch (error) {
      enqueueToast({ title: error instanceof Error ? error.message : "Failed to upload featured image", variant: "error" });
    } finally {
      setIsUploading(false);
    }
  }

  async function onRemove() {
    setIsRemoving(true);
    try {
      await patchFeaturedAsset(null);
      setImageUrl(null);
      enqueueToast({ title: "Featured image removed", variant: "success" });
      router.refresh();
    } catch (error) {
      enqueueToast({ title: error instanceof Error ? error.message : "Failed to remove featured image", variant: "error" });
    } finally {
      setIsRemoving(false);
    }
  }

  const hasImage = Boolean(featuredAssetId || imageUrl);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Featured image</CardTitle>
        <CardDescription>Upload a featured image for event cards and discovery.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {imageUrl ? (
          <div className="relative h-48 w-full max-w-md overflow-hidden rounded border">
            <Image src={imageUrl} alt="Event featured image" fill className="object-cover" sizes="(max-width: 768px) 100vw, 512px" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No featured image yet.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={isUploading || isRemoving}
            onChange={(event) => onUpload(event.target.files?.[0] ?? null)}
          />
          {hasImage ? <Button type="button" variant="outline" disabled={isUploading || isRemoving} onClick={onRemove}>{isRemoving ? "Removing..." : "Remove image"}</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
}
