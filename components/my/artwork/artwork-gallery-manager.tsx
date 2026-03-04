"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { buildLoginRedirectUrl } from "@/lib/auth-redirect";
import { enqueueToast } from "@/lib/toast";

type ArtworkImage = { id: string; url: string; alt: string | null; assetId: string };

export function ArtworkGalleryManager({
  artworkId,
  initialImages,
  initialCoverAssetId,
}: {
  artworkId: string;
  initialImages: ArtworkImage[];
  initialCoverAssetId: string | null;
}) {
  const router = useRouter();
  const [images, setImages] = useState<ArtworkImage[]>(initialImages);
  const [coverAssetId, setCoverAssetId] = useState<string | null>(initialCoverAssetId);
  const [isUploading, setIsUploading] = useState(false);
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [altDraftMap, setAltDraftMap] = useState<Record<string, string>>(
    Object.fromEntries(initialImages.map((image) => [image.id, image.alt ?? ""])),
  );

  const orderedImages = useMemo(() => images, [images]);

  function handleAuth(res: Response) {
    if (res.status === 401) {
      window.location.href = buildLoginRedirectUrl(`/my/artwork/${artworkId}`);
      return true;
    }

    if (res.status === 429) {
      enqueueToast({ title: "Too many requests, try again", variant: "error" });
    }

    return false;
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList?.length) return;

    const files = Array.from(fileList);
    setIsUploading(true);

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        const uploadRes = await fetch("/api/uploads/image", {
          method: "POST",
          body: formData,
        });

        if (handleAuth(uploadRes)) return;
        if (!uploadRes.ok) {
          enqueueToast({ title: `Failed to upload ${file.name}`, variant: "error" });
          continue;
        }

        const uploadData = (await uploadRes.json()) as { assetId: string };

        const createRes = await fetch(`/api/my/artwork/${artworkId}/images`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ assetId: uploadData.assetId }),
        });

        if (handleAuth(createRes)) return;
        if (!createRes.ok) {
          enqueueToast({ title: `Failed to attach ${file.name}`, variant: "error" });
          continue;
        }

        const body = (await createRes.json()) as { image?: { id: string; alt: string | null; assetId: string; url?: string; asset?: { url: string } } };
        if (body.image) {
          const nextImage: ArtworkImage = {
            id: body.image.id,
            alt: body.image.alt,
            assetId: body.image.assetId,
            url: body.image.url ?? body.image.asset?.url ?? "",
          };
          setImages((current) => [...current, nextImage]);
          setAltDraftMap((current) => ({ ...current, [nextImage.id]: nextImage.alt ?? "" }));
        } else {
          router.refresh();
        }
      }

      enqueueToast({ title: "Gallery updated", variant: "success" });
    } catch {
      enqueueToast({ title: "Image upload failed", variant: "error" });
    } finally {
      setIsUploading(false);
    }
  }

  async function reorderImages(nextImages: ArtworkImage[], fallbackImages: ArtworkImage[]) {
    setImages(nextImages);

    const res = await fetch(`/api/my/artwork/${artworkId}/images/reorder`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageIds: nextImages.map((image) => image.id) }),
    });

    if (handleAuth(res)) return;

    if (!res.ok) {
      setImages(fallbackImages);
      enqueueToast({ title: "Failed to reorder images", variant: "error" });
      return;
    }

    enqueueToast({ title: "Order saved", variant: "success" });
  }

  async function move(imageId: string, direction: -1 | 1) {
    const index = orderedImages.findIndex((image) => image.id === imageId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= orderedImages.length) return;

    const fallback = [...orderedImages];
    const reordered = [...orderedImages];
    const [item] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, item);

    await reorderImages(reordered, fallback);
  }

  async function saveAlt(imageId: string) {
    const rawAlt = altDraftMap[imageId] ?? "";
    const alt = rawAlt.trim() ? rawAlt.trim() : null;
    setLoadingMap((prev) => ({ ...prev, [imageId]: true }));

    try {
      const res = await fetch(`/api/my/artwork/images/${imageId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alt }),
      });

      if (handleAuth(res)) return;
      if (!res.ok) {
        enqueueToast({ title: "Failed to update alt text", variant: "error" });
        return;
      }

      setImages((current) => current.map((image) => (image.id === imageId ? { ...image, alt } : image)));
      enqueueToast({ title: "Alt text saved", variant: "success" });
    } finally {
      setLoadingMap((prev) => ({ ...prev, [imageId]: false }));
    }
  }

  async function removeImage(imageId: string) {
    setDeleteTargetId(null);

    const previousImages = images;
    const previousCover = coverAssetId;
    const deletedImage = images.find((image) => image.id === imageId);
    const nextImages = images.filter((image) => image.id !== imageId);
    const nextCoverImage = deletedImage?.assetId === coverAssetId ? nextImages[0] ?? null : null;

    setLoadingMap((prev) => ({ ...prev, [imageId]: true }));
    setImages(nextImages);
    if (nextCoverImage) {
      setCoverAssetId(nextCoverImage.assetId);
    } else if (deletedImage?.assetId === coverAssetId) {
      setCoverAssetId(null);
    }

    const res = await fetch(`/api/my/artwork/images/${imageId}`, { method: "DELETE" });

    if (handleAuth(res)) return;

    if (!res.ok) {
      setImages(previousImages);
      setCoverAssetId(previousCover);
      enqueueToast({ title: "Failed to delete image", variant: "error" });
      return;
    }

    if (deletedImage?.assetId === previousCover) {
      const coverRes = await fetch(`/api/my/artwork/${artworkId}/cover`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageId: nextCoverImage?.id ?? null }),
      });

      if (handleAuth(coverRes) || !coverRes.ok) {
        router.refresh();
        enqueueToast({ title: "Image deleted, but failed to update cover", variant: "error" });
        return;
      }
    }

    enqueueToast({ title: "Image deleted", variant: "success" });
  }

  async function setAsCover(imageId: string) {
    const nextCover = images.find((image) => image.id === imageId);
    if (!nextCover) return;

    const previous = coverAssetId;
    setLoadingMap((prev) => ({ ...prev, [`cover:${imageId}`]: true }));
    setCoverAssetId(nextCover.assetId);

    try {
      const res = await fetch(`/api/my/artwork/${artworkId}/cover`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageId }),
      });

      if (handleAuth(res)) return;
      if (!res.ok) {
        setCoverAssetId(previous);
        enqueueToast({ title: "Failed to set cover", variant: "error" });
        return;
      }

      enqueueToast({ title: "Cover updated", variant: "success" });
    } finally {
      setLoadingMap((prev) => ({ ...prev, [`cover:${imageId}`]: false }));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Artwork gallery</CardTitle>
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={isUploading}
          onChange={(event) => uploadFiles(event.target.files)}
          className="max-w-xs"
        />
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          {orderedImages.map((image, index) => (
            <article key={image.id} className="space-y-2 rounded border p-3">
              <div className="relative h-36 w-full overflow-hidden rounded border">
                <Image src={image.url} alt={image.alt ?? "Artwork image"} fill className="object-cover" sizes="(max-width: 768px) 100vw, 50vw" />
              </div>
              {coverAssetId === image.assetId ? <p className="text-xs font-medium text-emerald-700">Current cover</p> : null}
              <div className="flex gap-2">
                <Input
                  value={altDraftMap[image.id] ?? ""}
                  placeholder="Alt text"
                  onChange={(event) => setAltDraftMap((prev) => ({ ...prev, [image.id]: event.target.value }))}
                  disabled={Boolean(loadingMap[image.id])}
                />
                <Button type="button" variant="outline" onClick={() => saveAlt(image.id)} disabled={Boolean(loadingMap[image.id])}>
                  Save
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => move(image.id, -1)} disabled={index === 0}>
                  Move Left
                </Button>
                <Button type="button" variant="outline" onClick={() => move(image.id, 1)} disabled={index === orderedImages.length - 1}>
                  Move Right
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAsCover(image.id)}
                  disabled={coverAssetId === image.assetId || Boolean(loadingMap[`cover:${image.id}`])}
                >
                  Set Cover
                </Button>
                {deleteTargetId === image.id ? (
                  <>
                    <span className="text-sm">Delete?</span>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={Boolean(loadingMap[image.id])}
                      onClick={() => void removeImage(image.id)}
                    >
                      Yes, delete
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDeleteTargetId(null)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setDeleteTargetId(image.id)}
                    disabled={Boolean(loadingMap[image.id])}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
