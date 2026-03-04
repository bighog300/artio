"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function MyArtworkNewPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function createDraft() {
    setError(null);
    try {
      const response = await fetch("/api/my/artwork", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Untitled artwork" }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body?.error?.message ?? "Failed to create artwork. Please try again.");
        return;
      }
      const data = (await response.json()) as { artwork?: { id: string } };
      if (data.artwork?.id) {
        router.replace(`/my/artwork/${data.artwork.id}`);
      } else {
        setError("Unexpected response. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    }
  }

  useEffect(() => {
    let mounted = true;
    void createDraft().then(() => {
      if (!mounted) return;
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <main className="space-y-3 p-6">
        <p className="text-sm text-destructive">{error}</p>
        <Button onClick={() => void createDraft()}>Retry</Button>
        <Button variant="outline" asChild>
          <Link href="/my/artwork">Back to artworks</Link>
        </Button>
      </main>
    );
  }

  return <main className="p-6 text-sm text-muted-foreground">Creating artwork…</main>;
}
