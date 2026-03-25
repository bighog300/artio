"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildLoginRedirectUrl } from "@/lib/auth-redirect";
import { uploadImageAssetWithAutoFinalize } from "@/lib/assets/client-upload";
import { ASSET_PIPELINE_CONFIG } from "@/lib/assets/config";
import { enqueueToast } from "@/lib/toast";

type VenueImage = { id: string; url: string; alt: string | null; sortOrder: number };
const ALLOWED_IMAGE_MIME_TYPES = ASSET_PIPELINE_CONFIG.acceptedMimeTypes;
const MAX_IMAGE_UPLOAD_BYTES = ASSET_PIPELINE_CONFIG.maxUploadBytes;

export function VenueGalleryManager({
  venueId,
  initialImages,
  initialCover,
}: {
  venueId: string;
  initialImages: VenueImage[];
  initialCover: { featuredImageUrl: string | null };
}) {
  const router = useRouter();
  const [images, setImages] = useState<VenueImage[]>(initialImages);
  const [coverImageUrl, setCoverImageUrl] = useState(initialCover.featuredImageUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<"uploading" | "processing" | "ready" | "failed" | null>(null);
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  const sorted = useMemo(() => [...images].sort((a, b) => a.sortOrder - b.sortOrder), [images]);

  function handleAuth(res: Response) {
    if (res.status === 401) {
      window.location.href = buildLoginRedirectUrl(`/my/venues/${venueId}`);
      return true;
    }
    if (res.status === 429) enqueueToast({ title: "Too many requests, try again", variant: "error" });
    return false;
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    setIsUploading(true);
    setUploadPhase("uploading");

    try {
      for (const file of files) {
        if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
          enqueueToast({ title: `${file.name}: unsupported file type`, variant: "error" });
          continue;
        }
        if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
          enqueueToast({ title: `${file.name}: file too large`, variant: "error" });
          continue;
        }

        const uploaded = await uploadImageAssetWithAutoFinalize(file, {
          preset: "landscape",
          onStatusChange: (status) => setUploadPhase(status),
        });

        const createRes = await fetch(`/api/my/venues/${venueId}/images`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ assetId: uploaded.assetId, url: uploaded.url, alt: null }),
        });

        if (handleAuth(createRes)) return;
        if (!createRes.ok) {
          enqueueToast({ title: `Failed to save ${file.name}`, variant: "error" });
          continue;
        }

        const data = (await createRes.json()) as { image: VenueImage };
        setImages((current) => [...current, data.image]);
      }
      enqueueToast({ title: "Gallery updated", variant: "success" });
      setUploadPhase("ready");
    } catch {
      setUploadPhase("failed");
      enqueueToast({ title: "Image upload failed", variant: "error" });
    } finally {
      setIsUploading(false);
      router.refresh();
    }
  }

  async function saveAlt(imageId: string, alt: string) {
    setLoadingMap((prev) => ({ ...prev, [imageId]: true }));
    try {
      const res = await fetch(`/api/my/venues/images/${imageId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alt }),
      });
      if (handleAuth(res)) return;
      if (!res.ok) {
        enqueueToast({ title: "Failed to update alt text", variant: "error" });
        return;
      }
      const data = (await res.json()) as { image: VenueImage };
      setImages((current) => current.map((item) => (item.id === imageId ? data.image : item)));
      enqueueToast({ title: "Alt text saved", variant: "success" });
    } finally {
      setLoadingMap((prev) => ({ ...prev, [imageId]: false }));
    }
  }

  async function move(imageId: string, direction: -1 | 1) {
    const index = sorted.findIndex((item) => item.id === imageId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= sorted.length) return;

    const reordered = [...sorted];
    const [item] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, item);
    const optimistic = reordered.map((img, order) => ({ ...img, sortOrder: order }));
    setImages(optimistic);

    const res = await fetch(`/api/my/venues/${venueId}/images/reorder`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderedIds: optimistic.map((img) => img.id) }),
    });

    if (handleAuth(res)) return;
    if (!res.ok) {
      enqueueToast({ title: "Failed to reorder images", variant: "error" });
      setImages(sorted);
      return;
    }

    enqueueToast({ title: "Order saved", variant: "success" });
  }

  async function remove(imageId: string) {
    setLoadingMap((prev) => ({ ...prev, [imageId]: true }));
    const prev = images;
    setImages((current) => current.filter((img) => img.id !== imageId));

    const res = await fetch(`/api/my/venues/images/${imageId}`, { method: "DELETE" });
    if (handleAuth(res)) return;
    if (!res.ok) {
      setImages(prev);
      enqueueToast({ title: "Failed to delete image", variant: "error" });
      return;
    }

    enqueueToast({ title: "Image deleted", variant: "success" });
  }


  async function clearCover() {
    if (!coverImageUrl || !window.confirm("Clear current cover image?")) return;

    const previous = coverImageUrl;
    setCoverImageUrl(null);
    setLoadingMap((prev) => ({ ...prev, clearCover: true }));

    try {
      const res = await fetch(`/api/my/venues/${venueId}/cover`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageId: null }),
      });

      if (handleAuth(res)) return;
      if (!res.ok) {
        setCoverImageUrl(previous);
        enqueueToast({ title: "Failed to clear cover", variant: "error" });
        return;
      }

      enqueueToast({ title: "Cover cleared", variant: "success" });
      router.refresh();
    } finally {
      setLoadingMap((prev) => ({ ...prev, clearCover: false }));
    }
  }

  async function setAsCover(image: VenueImage) {
    const previous = coverImageUrl;
    setCoverImageUrl(image.url);
    setLoadingMap((prev) => ({ ...prev, [`cover:${image.id}`]: true }));

    try {
      const res = await fetch(`/api/my/venues/${venueId}/cover`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageId: image.id }),
      });

      if (handleAuth(res)) return;
      if (!res.ok) {
        setCoverImageUrl(previous);
        enqueueToast({ title: "Failed to update cover", variant: "error" });
        return;
      }

      const data = (await res.json()) as { cover: { featuredImageUrl: string | null } };
      setCoverImageUrl(data.cover.featuredImageUrl ?? image.url);
      enqueueToast({ title: "Cover updated", variant: "success" });
      router.refresh();
    } finally {
      setLoadingMap((prev) => ({ ...prev, [`cover:${image.id}`]: false }));
    }
  }

  return (
    <section className="space-y-3 rounded border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Gallery</h2>
        {coverImageUrl ? (
          <button className="rounded border px-2 py-1 text-sm" disabled={Boolean(loadingMap.clearCover)} onClick={clearCover}>Clear cover</button>
        ) : null}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={isUploading}
          onChange={(event) => uploadFiles(event.target.files)}
        />
        {uploadPhase ? <p className="text-xs text-muted-foreground">Status: {uploadPhase}</p> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {sorted.map((image, index) => (
          <article key={image.id} className="rounded border p-3 space-y-2">
            <div className="relative aspect-square w-full overflow-hidden rounded border bg-muted">
              <Image src={image.url} alt={image.alt ?? "Venue image"} fill className="object-contain" sizes="(max-width: 768px) 100vw, 50vw" />
            </div>
            {coverImageUrl === image.url ? <p className="text-xs font-medium text-emerald-700">Current cover</p> : null}
            <input
              className="w-full rounded border px-2 py-1 text-sm"
              defaultValue={image.alt ?? ""}
              placeholder="Alt text"
              onBlur={(event) => saveAlt(image.id, event.target.value)}
              disabled={Boolean(loadingMap[image.id])}
            />
            <div className="flex gap-2 text-sm">
              <button className="rounded border px-2 py-1" disabled={coverImageUrl === image.url || Boolean(loadingMap[`cover:${image.id}`])} onClick={() => setAsCover(image)}>Set as cover</button>
              <button className="rounded border px-2 py-1" disabled={index === 0} onClick={() => move(image.id, -1)}>Up</button>
              <button className="rounded border px-2 py-1" disabled={index === sorted.length - 1} onClick={() => move(image.id, 1)}>Down</button>
              <button className="rounded border px-2 py-1 text-red-700" disabled={Boolean(loadingMap[image.id])} onClick={() => remove(image.id)}>Delete</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
