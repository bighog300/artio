import { notFound } from "next/navigation";
import AdminEntityForm from "@/app/(admin)/admin/_components/AdminEntityForm";
import AdminPageHeader from "@/app/(admin)/admin/_components/AdminPageHeader";
import { db } from "@/lib/db";
import { ADMIN_IMAGE_ALT_REQUIRED } from "@/lib/admin-policy";
import { AdminArchiveActions } from "@/app/(admin)/admin/_components/AdminArchiveActions";
import AdminHardDeleteButton from "@/app/(admin)/admin/_components/AdminHardDeleteButton";
import ModerationPanel from "@/app/(admin)/admin/_components/ModerationPanel";
import { evaluateArtistReadiness } from "@/lib/publish-readiness";
import { ImageReplacePanel } from "@/components/admin/ImageReplacePanel";

export default async function AdminArtist({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const artist = await db.artist.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      bio: true,
      websiteUrl: true,
      instagramUrl: true,
      twitterUrl: true,
      linkedinUrl: true,
      tiktokUrl: true,
      youtubeUrl: true,
      mediums: true,
      avatarImageUrl: true,
      featuredImageUrl: true,
      featuredAssetId: true,
      featuredAsset: { select: { url: true } },
      status: true,
      isPublished: true,
      deletedAt: true,
    },
  });
  if (!artist) notFound();

  const currentImageUrl =
    (artist as { featuredAsset?: { url?: string | null } | null }).featuredAsset?.url
    ?? artist.featuredImageUrl
    ?? null;

  const readiness = evaluateArtistReadiness(artist);
  const blockers = readiness.blocking.map((b) => b.label);

  return (
    <main className="space-y-6">
      <AdminPageHeader title="Edit artist" backHref="/admin/artists" backLabel="Back to artists" />
      <AdminEntityForm
        title="Edit Artist"
        endpoint={`/api/admin/artists/${id}`}
        method="PATCH"
        redirectPath="/admin/artists"
        uploadTargetType="artist"
        uploadTargetId={id}
        initial={artist}
        fields={[
          { name: "name", label: "Name" },
          { name: "slug", label: "Slug" },
          { name: "bio", label: "Bio" },
          { name: "websiteUrl", label: "Website URL" },
          { name: "instagramUrl", label: "Instagram URL" },
          { name: "twitterUrl", label: "Twitter / X URL" },
          { name: "linkedinUrl", label: "LinkedIn URL" },
          { name: "tiktokUrl", label: "TikTok URL" },
          { name: "youtubeUrl", label: "YouTube URL" },
          { name: "nationality", label: "Nationality" },
          { name: "birthYear", label: "Birth year" },
          { name: "mediums", label: "Mediums (comma-separated)" },
          { name: "avatarImageUrl", label: "Avatar Image URL" },
          { name: "featuredImageUrl", label: "Featured Image URL" },
          { name: "featuredAssetId", label: "Featured Asset ID" },
        ]}
        altRequired={ADMIN_IMAGE_ALT_REQUIRED}
      />
      <ImageReplacePanel
        endpoint={`/api/admin/artists/${id}/image`}
        label="artist"
        currentImageUrl={currentImageUrl}
      />
      <ModerationPanel resource="artists" id={artist.id} status={artist.status} blockers={blockers} />
      <section className="rounded-lg border border-destructive/30 bg-card p-4">
        <h2 className="text-base font-semibold">Danger zone</h2>
        <p className="mt-1 text-sm text-muted-foreground">Archive or restore first. Permanent delete is irreversible.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <AdminArchiveActions entity="artists" id={artist.id} archived={!!artist.deletedAt} />
        </div>
        <div className="mt-4 border-t pt-4">
          <p className="mb-2 text-sm text-muted-foreground">Hard delete permanently removes this artist and related data.</p>
          <AdminHardDeleteButton entityLabel="Artist" entityId={artist.id} deleteUrl={`/api/admin/artists/${artist.id}`} redirectTo="/admin/artists" />
        </div>
      </section>
    </main>
  );
}
