"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { computeArtworkCompleteness } from "@/lib/artwork-completeness";
import { computeArtistCompleteness } from "@/lib/artist-completeness";

type ArtistRow = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  mediums: string[];
  nationality: string | null;
  birthYear: number | null;
  websiteUrl: string | null;
  instagramUrl: string | null;
  image?: { url: string | null; isProcessing: boolean; hasFailure: boolean } | null;
  _count: { artworks: number };
};

type ArtworkRow = {
  id: string;
  title: string;
  slug: string;
  medium: string | null;
  year: number | null;
  description: string | null;
  featuredAssetId: string | null;
  image?: { url: string | null; isProcessing: boolean; hasFailure: boolean } | null;
  artist: { id: string; name: string; slug: string; status: string };
  _count: { images: number };
};

function ScorePill({ score, missing }: { score: number; missing?: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-16 overflow-hidden rounded bg-muted">
          <div className={`h-full rounded ${score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-400"}`} style={{ width: `${score}%` }} />
        </div>
        <span className="text-xs text-muted-foreground">{score}%</span>
      </div>
      {missing && missing.length > 0 ? <p className="text-xs leading-tight text-muted-foreground">Missing: {missing.join(", ")}</p> : null}
    </div>
  );
}

export default function ReadyToPublishClient({
  artists,
  artworks,
  userRole: _userRole,
}: {
  artists: ArtistRow[];
  artworks: ArtworkRow[];
  userRole?: "USER" | "EDITOR" | "ADMIN";
}) {
  const [artistRows, setArtistRows] = useState(artists);
  const [artworkRows, setArtworkRows] = useState(artworks);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [publishedArtistName, setPublishedArtistName] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});
  const [blockingByArtworkId, setBlockingByArtworkId] = useState<Record<string, string[]>>({});

  const total = artistRows.length + artworkRows.length;

  const artistCompleteness = useMemo(
    () => Object.fromEntries(artistRows.map((artist) => [artist.id, computeArtistCompleteness(artist)])),
    [artistRows],
  );

  async function publishArtist(id: string) {
    setWorkingId(id);
    setPublishedArtistName(null);
    setErrorById((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/admin/ingest/ready-to-publish/artists/${id}`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setErrorById((prev) => ({ ...prev, [id]: body.error?.message ?? "Failed to publish artist." }));
        return;
      }
      const publishedArtist = artistRows.find((item) => item.id === id);
      setArtistRows((prev) => prev.filter((item) => item.id !== id));
      setPublishedArtistName(publishedArtist?.name ?? "Artist");
    } catch {
      setErrorById((prev) => ({ ...prev, [id]: "Failed to publish artist." }));
    } finally {
      setWorkingId(null);
    }
  }

  async function publishArtwork(id: string) {
    setWorkingId(id);
    setErrorById((prev) => ({ ...prev, [id]: "" }));
    setBlockingByArtworkId((prev) => ({ ...prev, [id]: [] }));
    try {
      const res = await fetch(`/api/admin/ingest/ready-to-publish/artworks/${id}`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string; details?: { blocking?: Array<{ label?: string }> } } };
      if (!res.ok) {
        if (res.status === 400 && body.error?.code === "not_ready") {
          const blocking = body.error?.details?.blocking?.map((issue) => issue.label).filter((label): label is string => Boolean(label)) ?? [];
          setBlockingByArtworkId((prev) => ({ ...prev, [id]: blocking }));
          return;
        }
        setErrorById((prev) => ({ ...prev, [id]: body.error?.message ?? "Failed to publish artwork." }));
        return;
      }
      setArtworkRows((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setErrorById((prev) => ({ ...prev, [id]: "Failed to publish artwork." }));
    } finally {
      setWorkingId(null);
    }
  }

  if (total === 0) {
    return <div className="rounded-lg border bg-background p-10 text-center text-sm text-muted-foreground">Nothing waiting to publish.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-background">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Artists</h2>
          <div className="flex items-center gap-3">
            {publishedArtistName ? <span className="text-xs text-emerald-700">Published {publishedArtistName}</span> : null}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{artistRows.length}</span>
          </div>
        </div>
        {artistRows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No artists waiting to publish.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-3 py-2">Image</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Completeness</th>
                  <th className="px-3 py-2">Mediums</th>
                  <th className="px-3 py-2">Artworks</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {artistRows.map((artist) => (
                  <tr key={artist.id} className="border-b align-top">
                    <td className="px-3 py-2">
                      {artist.image?.url ? (
                        <div className="relative">
                          <img src={artist.image.url} alt={artist.name} className="h-12 w-12 rounded object-cover" />
                          {artist.image.isProcessing ? <span className="absolute -bottom-2 left-0 rounded bg-background px-1 text-[10px] text-muted-foreground">Processing…</span> : null}
                          {artist.image.hasFailure ? <span className="absolute -bottom-2 left-0 rounded bg-amber-100 px-1 text-[10px] text-amber-800">Issue</span> : null}
                        </div>
                      ) : (
                        <div className="h-12 w-12 rounded bg-muted" />
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium"><Link href={`/admin/artists/${artist.id}`} className="underline">{artist.name}</Link></td>
                    <td className="px-3 py-2"><ScorePill score={artistCompleteness[artist.id]?.score ?? 0} missing={artistCompleteness[artist.id]?.missing} /></td>
                    <td className="px-3 py-2">{artist.mediums.length > 0 ? artist.mediums.join(", ") : "—"}</td>
                    <td className="px-3 py-2">{artist._count.artworks}</td>
                    <td className="px-3 py-2">
                      <Button size="sm" variant="outline" disabled={workingId === artist.id} onClick={() => publishArtist(artist.id)}>
                        {workingId === artist.id ? "Publishing…" : "Publish"}
                      </Button>
                      {errorById[artist.id] ? <p className="mt-1 text-xs text-red-600">{errorById[artist.id]}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-background">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Artworks</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{artworkRows.length}</span>
        </div>
        {artworkRows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No artworks waiting to publish.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-3 py-2">Image</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Artist</th>
                  <th className="px-3 py-2">Medium</th>
                  <th className="px-3 py-2">Year</th>
                  <th className="px-3 py-2">Completeness</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {artworkRows.map((artwork) => {
                  const completeness = computeArtworkCompleteness(artwork, artwork._count.images);
                  const missing = [...completeness.required.issues, ...completeness.recommended.issues].map((item) => item.label);
                  return (
                    <Fragment key={artwork.id}>
                      <tr className="border-b align-top">
                        <td className="px-3 py-2">
                          {artwork.image?.url ? (
                            <div className="relative">
                              <img src={artwork.image.url} alt={artwork.title} className="h-12 w-12 rounded object-cover" />
                              {artwork.image.isProcessing ? <span className="absolute -bottom-2 left-0 rounded bg-background px-1 text-[10px] text-muted-foreground">Processing…</span> : null}
                              {artwork.image.hasFailure ? <span className="absolute -bottom-2 left-0 rounded bg-amber-100 px-1 text-[10px] text-amber-800">Issue</span> : null}
                            </div>
                          ) : (
                            <div className="h-12 w-12 rounded bg-muted" />
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium"><Link href={`/admin/artwork/${artwork.id}`} className="underline">{artwork.title}</Link></td>
                        <td className="px-3 py-2">
                          <Link href={`/admin/artists/${artwork.artist.id}`} className="underline">{artwork.artist.name}</Link>
                          {artwork.artist.status === "IN_REVIEW" ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">(stub)</span> : null}
                        </td>
                        <td className="px-3 py-2">{artwork.medium || "—"}</td>
                        <td className="px-3 py-2">{artwork.year || "—"}</td>
                        <td className="px-3 py-2"><ScorePill score={completeness.scorePct} missing={missing} /></td>
                        <td className="px-3 py-2">
                          <Button size="sm" variant="outline" disabled={workingId === artwork.id} onClick={() => publishArtwork(artwork.id)}>
                            {workingId === artwork.id ? "Publishing…" : "Publish"}
                          </Button>
                          {errorById[artwork.id] ? <p className="mt-1 text-xs text-red-600">{errorById[artwork.id]}</p> : null}
                        </td>
                      </tr>
                      {blockingByArtworkId[artwork.id]?.length ? (
                        <tr key={`${artwork.id}-blocking`} className="border-b">
                          <td className="px-3 pb-3" colSpan={7}>
                            <p className="text-xs font-medium text-amber-700">Cannot publish yet:</p>
                            <ul className="ml-5 list-disc text-xs text-amber-700">
                              {blockingByArtworkId[artwork.id].map((item) => <li key={item}>{item}</li>)}
                            </ul>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
