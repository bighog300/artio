"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ImageUploader from "@/app/my/_components/ImageUploader";
import { enqueueToast } from "@/lib/toast";

type Props = {
  eventId: string;
  featuredImageUrl: string | null;
};

export function FeaturedEventImagePanel({ eventId, featuredImageUrl }: Props) {
  const router = useRouter();
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

  async function onUpload(uploaded: { assetId: string; url: string }) {
    setIsUploading(true);

    try {
      await patchFeaturedAsset(uploaded.assetId);
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
      enqueueToast({ title: "Featured image removed", variant: "success" });
      router.refresh();
    } catch (error) {
      enqueueToast({ title: error instanceof Error ? error.message : "Failed to remove featured image", variant: "error" });
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Featured image</CardTitle>
        <CardDescription>Upload a featured image for event cards and discovery.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ImageUploader
          label="Upload featured image"
          initialUrl={featuredImageUrl}
          onUploaded={(result) => { void onUpload(result); }}
          onRemove={onRemove}
        />
      </CardContent>
    </Card>
  );
}
