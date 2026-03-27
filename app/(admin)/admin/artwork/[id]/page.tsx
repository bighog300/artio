import { notFound } from "next/navigation";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { AdminArchiveActions } from "@/app/(admin)/admin/_components/AdminArchiveActions";
import AdminHardDeleteButton from "@/app/(admin)/admin/_components/AdminHardDeleteButton";
import { db } from "@/lib/db";
import ArtworkAdminForm from "../ArtworkAdminForm";
import ModerationPanel from "@/app/(admin)/admin/_components/ModerationPanel";
import { computeArtworkCompleteness } from "@/lib/artwork-completeness";
import { ImageReplacePanel } from "@/components/admin/ImageReplacePanel";
import { ArtworkTagsPanel } from "./ArtworkTagsPanel";

export default async function AdminArtworkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [artwork, allTags] = await Promise.all([
    db.artwork.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        isPublished: true,
        artistId: true,
        medium: true,
        year: true,
        dimensions: true,
        provenance: true,
        tags: {
          select: {
            tag: {
              select: { id: true, name: true, slug: true, category: true },
            },
          },
        },
        completenessScore: true,
        completenessFlags: true,
        completenessUpdatedAt: true,
        priceAmount: true,
        currency: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        deletedReason: true,
        featuredAssetId: true,
        featuredAsset: { select: { url: true } },
        images: { select: { id: true } },
      },
    }),
    db.tag.findMany({
      select: { id: true, name: true, slug: true, category: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
  ]);

  if (!artwork) notFound();

  const currentImageUrl =
    (artwork as { featuredAsset?: { url?: string | null } | null }).featuredAsset?.url
    ?? null;

  const completeness = computeArtworkCompleteness({
    title: artwork.title,
    description: artwork.description,
    medium: artwork.medium,
    year: artwork.year,
    featuredAssetId: artwork.featuredAssetId,
    dimensions: artwork.dimensions,
    provenance: artwork.provenance,
  }, artwork.images.length);

  const blockers = completeness.required.issues.map((issue) => issue.label);
  const derivedStatus = artwork.deletedAt
    ? "ARCHIVED"
    : artwork.isPublished
      ? "PUBLISHED"
      : artwork.deletedReason?.startsWith("Rejected:")
        ? "REJECTED"
        : artwork.deletedReason?.startsWith("Changes requested:")
          ? "CHANGES_REQUESTED"
          : "DRAFT";

  return (
    <main className="space-y-6">
      <AdminPageHeader title="Edit artwork" backHref="/admin/artwork" backLabel="Back to artwork" />
      <ArtworkAdminForm
        artworkId={artwork.id}
        initial={{
          title: artwork.title,
          slug: artwork.slug,
          description: artwork.description,
          medium: artwork.medium,
          year: artwork.year,
          dimensions: artwork.dimensions,
          priceAmountMajor: artwork.priceAmount != null ? artwork.priceAmount / 100 : null,
          currency: artwork.currency,
          isPublished: artwork.isPublished,
          artistId: artwork.artistId,
        }}
      />
      <ImageReplacePanel
        endpoint={`/api/admin/artworks/${artwork.id}/image`}
        label="artwork"
        currentImageUrl={currentImageUrl}
      />
      <ArtworkTagsPanel
        artworkId={artwork.id}
        initialTags={artwork.tags.map((item) => item.tag)}
        allTags={allTags}
      />
      <ModerationPanel resource="artwork" id={artwork.id} status={derivedStatus} blockers={blockers} />
      {artwork.completenessUpdatedAt ? (
        <section className="rounded-lg border bg-background p-4">
          <h2 className="mb-3 text-sm font-semibold">Data completeness</h2>
          <div className="mb-2 flex items-center gap-3">
            <div className="h-2 w-32 overflow-hidden rounded bg-muted">
              <div
                className={`h-full rounded ${
                  artwork.completenessScore >= 80
                    ? "bg-emerald-500"
                    : artwork.completenessScore >= 60
                      ? "bg-amber-400"
                      : "bg-rose-400"
                }`}
                style={{ width: `${artwork.completenessScore}%` }}
              />
            </div>
            <span className="text-sm text-muted-foreground">{artwork.completenessScore}% complete</span>
          </div>
          {artwork.completenessFlags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {artwork.completenessFlags.map((flag) => (
                <span key={flag} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  {flag.replace(/_/g, " ").toLowerCase()}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-emerald-700">No data gaps</p>
          )}
        </section>
      ) : (
        <section className="rounded-lg border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            Completeness not yet scored. Trigger{" "}
            <a href="/api/cron/artworks/score-completeness" className="underline">
              /api/cron/artworks/score-completeness
            </a>{" "}
            to populate.
          </p>
        </section>
      )}
      <section className="rounded-lg border border-destructive/30 bg-card p-4">
        <h2 className="text-base font-semibold">Danger zone</h2>
        <p className="mt-1 text-sm text-muted-foreground">Archive or restore first. Permanent delete is irreversible.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <AdminArchiveActions entity="artwork" id={artwork.id} archived={!!artwork.deletedAt} />
        </div>
        <div className="mt-4 border-t pt-4">
          <p className="mb-2 text-sm text-muted-foreground">Hard delete permanently removes this artwork and related data.</p>
          <AdminHardDeleteButton entityLabel="Artwork" entityId={artwork.id} deleteUrl={`/api/admin/artwork/${artwork.id}`} redirectTo="/admin/artwork" />
        </div>
      </section>
    </main>
  );
}
