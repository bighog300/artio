import { notFound } from "next/navigation";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { AdminArchiveActions } from "@/app/(admin)/admin/_components/AdminArchiveActions";
import AdminHardDeleteButton from "@/app/(admin)/admin/_components/AdminHardDeleteButton";
import { db } from "@/lib/db";
import ArtworkAdminForm from "../ArtworkAdminForm";

export default async function AdminArtworkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const artwork = await db.artwork.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      isPublished: true,
      artistId: true,
      year: true,
      medium: true,
      priceAmount: true,
      currency: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      deletedReason: true,
    },
  });

  if (!artwork) notFound();

  return (
    <main className="space-y-6">
      <AdminPageHeader title="Edit artwork" backHref="/admin/artwork" backLabel="Back to artwork" />
      <ArtworkAdminForm
        artworkId={artwork.id}
        initial={{
          title: artwork.title,
          slug: artwork.slug,
          description: artwork.description,
          isPublished: artwork.isPublished,
          artistId: artwork.artistId,
        }}
      />
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
