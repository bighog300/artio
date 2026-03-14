"use client";

import { useState } from "react";
import { enqueueToast } from "@/lib/toast";
import { uploadBrandingLogoToBlob } from "@/lib/admin-upload";

type Props = {
  initialLogo: { assetId: string; url: string } | null;
};

export default function BrandingClient({ initialLogo }: Props) {
  const [logo, setLogo] = useState(initialLogo);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  async function onUpload(file: File) {
    if (!["image/png", "image/webp"].includes(file.type)) {
      enqueueToast({ title: "Invalid file type", message: "Upload a PNG or WEBP image.", variant: "error" });
      return;
    }
    if (file.size > 2_000_000) {
      enqueueToast({ title: "File too large", message: "Max file size is 2MB.", variant: "error" });
      return;
    }

    setBusy(true);
    try {
      const uploaded = await uploadBrandingLogoToBlob(file, (percentage) => {
        setUploadProgress(percentage);
      });
      const response = await fetch("/api/admin/branding/logo/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blobUrl: uploaded.url,
          blobPath: uploaded.pathname ?? file.name,
          contentType: uploaded.contentType,
          size: uploaded.size,
        }),
      });
      if (!response.ok) throw new Error("Commit failed");
      const data = await response.json() as { logo: { assetId: string; url: string } };
      setLogo(data.logo);
      enqueueToast({ title: "Logo updated" });
    } catch (error) {
      enqueueToast({ title: "Upload failed", message: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  }

  async function onClear() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/branding/logo/clear", { method: "POST" });
      if (!response.ok) throw new Error("Remove failed");
      setLogo(null);
      enqueueToast({ title: "Logo removed" });
    } catch (error) {
      enqueueToast({ title: "Remove failed", message: error instanceof Error ? error.message : "Please try again.", variant: "error" });
    } finally {
      setBusy(false);
      setConfirmClear(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border bg-background p-4">
      <h2 className="text-base font-medium">Site logo</h2>
      <p className="text-sm text-muted-foreground">Upload a site-wide logo (PNG or WEBP, max 2MB).</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo ? <img src={logo.url} alt="Current site logo" className="max-h-20 w-auto rounded border p-2" /> : <p className="text-sm text-muted-foreground">No logo set.</p>}
      <input
        type="file"
        accept="image/png,image/webp"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onUpload(file);
          event.currentTarget.value = "";
        }}
      />
      {uploadProgress !== null ? (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-150"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">Uploading… {uploadProgress}%</p>
        </div>
      ) : null}
      {!confirmClear ? (
        <button
          type="button"
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
          disabled={busy || !logo}
          onClick={() => setConfirmClear(true)}
        >
          Remove logo
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Remove the current logo?</span>
          <button
            type="button"
            className="rounded border border-destructive px-3 py-1 text-sm text-destructive disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              setConfirmClear(false);
              void onClear();
            }}
          >
            Yes, remove
          </button>
          <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => setConfirmClear(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
