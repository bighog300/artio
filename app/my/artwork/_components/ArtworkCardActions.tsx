"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { enqueueToast } from "@/lib/toast";

type Props = {
  artworkId: string;
  slug: string | null;
  isPublished: boolean;
  isArchived: boolean;
  status: string | null;
};

export function ArtworkCardActions({
  artworkId,
  slug,
  isPublished,
  isArchived,
  status,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function post(path: string, method = "POST", body: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await res.json().catch(() => ({}));
      return { ok: res.ok, responseBody };
    } finally {
      setBusy(false);
    }
  }

  async function handlePublishToggle() {
    if (status === "IN_REVIEW") {
      return;
    }
    const { ok } = await post(`/api/my/artwork/${artworkId}/publish`, "PATCH", { isPublished: !isPublished });
    if (ok) {
      enqueueToast({
        title: isPublished ? "Artwork unpublished" : "Artwork submitted for review",
        variant: "success",
      });
      router.refresh();
      return;
    }

    enqueueToast({ title: "Action failed", variant: "error" });
  }

  async function handleArchive() {
    const action = isArchived ? "restore" : "archive";
    const { ok } = await post(`/api/my/artwork/${artworkId}/${action}`);
    if (ok) {
      enqueueToast({
        title: isArchived ? "Artwork restored" : "Artwork archived",
        variant: "success",
      });
      router.refresh();
      return;
    }

    enqueueToast({
      title: `Failed to ${action} artwork`,
      variant: "error",
    });
  }

  return (
    <div className="mt-2 flex items-center gap-1">
      <Button asChild size="sm" className="flex-1">
        <Link href={`/my/artwork/${artworkId}`}>Edit</Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="icon" variant="ghost" aria-label="More actions" disabled={busy}>
            ⋯
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {slug && !isArchived ? (
            <DropdownMenuItem asChild>
              <Link href={`/artwork/${slug}`}>View public</Link>
            </DropdownMenuItem>
          ) : null}
          {!isArchived ? (
            <DropdownMenuItem
              onSelect={() => void handlePublishToggle()}
              disabled={status === "IN_REVIEW"}
            >
              {status === "IN_REVIEW" ? "In review" : isPublished ? "Unpublish" : "Publish"}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => void handleArchive()}
          >
            {isArchived ? "Restore" : "Archive"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
