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
  venueId: string;
  slug: string | null;
  isPublished: boolean;
  isArchived: boolean;
};

export function VenueRowActions({
  venueId,
  slug,
  isPublished,
  isArchived,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleArchive() {
    const action = isArchived ? "restore" : "archive";
    setBusy(true);
    const res = await fetch(`/api/my/venues/${venueId}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      enqueueToast({
        title: isArchived ? "Venue restored" : "Venue archived",
        variant: "success",
      });
      router.refresh();
    } else {
      enqueueToast({
        title: body?.error?.message ?? `Failed to ${action} venue`,
        variant: "error",
      });
    }
  }

  return (
    <div className="inline-flex items-center gap-1">
      <Button asChild size="sm">
        <Link href={`/my/venues/${venueId}`}>Edit venue</Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="More actions"
            disabled={busy}
          >
            ⋯
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/my/venues/${venueId}/submit-event`}>
              Submit event
            </Link>
          </DropdownMenuItem>
          {isPublished && slug && !isArchived ? (
            <DropdownMenuItem asChild>
              <Link href={`/venues/${slug}`}>View public</Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link href={`/my/team?venueId=${venueId}`}>
              Manage team
            </Link>
          </DropdownMenuItem>
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
