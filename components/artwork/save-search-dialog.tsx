"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SaveSearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchParams: URLSearchParams;
};

export function SaveSearchDialog({
  open,
  onOpenChange,
  searchParams,
}: SaveSearchDialogProps) {
  const [saveName, setSaveName] = useState("Artworks: Filtered search");
  const [frequency, setFrequency] = useState<"WEEKLY" | "OFF">("WEEKLY");
  const [message, setMessage] = useState<string | null>(null);

  async function saveSearch() {
    const params = Object.fromEntries(searchParams.entries());
    const mediumValues = searchParams.getAll("medium");
    const payload = {
      type: "ARTWORK",
      name: saveName.trim() || "Artworks: Filtered search",
      frequency: frequency === "WEEKLY" ? "WEEKLY" : undefined,
      params: {
        provider: "ARTWORKS",
        ...params,
        medium: mediumValues,
        page: undefined,
      },
    };
    const res = await fetch("/api/saved-searches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setMessage("Saved search created.");
      onOpenChange(false);
    } else {
      setMessage("Could not save search.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save this artwork search</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            className="w-full rounded border p-2 text-sm"
          />
          <select
            value={frequency}
            onChange={(e) =>
              setFrequency(e.target.value as "WEEKLY" | "OFF")
            }
            className="w-full rounded border p-2 text-sm"
          >
            <option value="WEEKLY">Weekly</option>
            <option value="OFF">Off</option>
          </select>
          {message ? (
            <div className="text-sm">
              {message}{" "}
              {message.includes("created") && (
                <Link className="underline" href="/saved-searches">
                  Manage saved searches
                </Link>
              )}
            </div>
          ) : null}
          <button
            className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
            onClick={() => void saveSearch()}
          >
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
