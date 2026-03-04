import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { hasDatabaseUrl } from "@/lib/runtime-db";
import { resolveArtistCoverUrl } from "@/lib/artists";
import { ArtistProfileForm } from "@/components/artists/artist-profile-form";
import { ArtistGalleryManager } from "@/components/artists/artist-gallery-manager";
import { ArtistPublishPanel } from "@/app/my/_components/ArtistPublishPanel";
import { ArtistVenuesPanel } from "@/components/artists/artist-venues-panel";
import { Button } from "@/components/ui/button";
import { countAllArtworksByArtist } from "@/lib/artworks";
import { ArtistFeaturedArtworksPanel } from "@/components/artists/artist-featured-artworks-panel";
import { CreateArtistProfileForm } from "@/app/my/artist/_components/CreateArtistProfileForm";
import { evaluateArtistReadiness } from "@/lib/publish-readiness";
import { PublishReadinessChecklist } from "@/components/publishing/publish-readiness-checklist";

export default async function MyArtistPage() {
  const user = await getSessionUser();
  if (!user) redirectToLogin("/my/artist");

  if (!hasDatabaseUrl()) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">My Artist Profile</h1>
        <p>Set DATABASE_URL to manage your artist profile locally.</p>
      </main>
    );
  }

  const artist = await db.artist.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      slug: true,
      isPublished: true,
      name: true,
      bio: true,
      websiteUrl: true,
      instagramUrl: true,
      avatarImageUrl: true,
      featuredAssetId: true,
      featuredImageUrl: true,
      featuredAsset: { select: { url: true } },
      images: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, url: true, alt: true, sortOrder: true, assetId: true, asset: { select: { url: true } } },
      },
      venueAssociations: { select: { id: true } },
      targetSubmissions: {
        where: { type: "ARTIST", kind: "PUBLISH" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, submittedAt: true, decidedAt: true, decisionReason: true },
      },
    },
  });

  if (!artist) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">My Artist Profile</h1>
        <p className="text-sm text-muted-foreground">Create your draft artist profile to unlock your creator hub. Editorial review is still required before publishing.</p>
        <CreateArtistProfileForm />
      </main>
    );
  }

  const latestSubmission = artist.targetSubmissions[0] ?? null;
  const [publishedVenues, artworkCount, publishedArtworks, featuredArtworks] = await Promise.all([
    db.venue.findMany({
      where: { isPublished: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
      take: 20, // Limited to avoid large payloads — ArtistVenuesPanel should move to search/autocomplete for scale
    }),
    countAllArtworksByArtist(artist.id),
    db.artwork.findMany({
      where: { artistId: artist.id, isPublished: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, title: true, featuredAsset: { select: { url: true } }, images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 1, select: { asset: { select: { url: true } } } }, isPublished: true },
      take: 100,
    }),
    db.artistFeaturedArtwork.findMany({
      where: { artistId: artist.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { sortOrder: true, artwork: { select: { id: true, slug: true, title: true, featuredAsset: { select: { url: true } }, images: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 1, select: { asset: { select: { url: true } } } } } } },
    }),
  ]);

  const readiness = evaluateArtistReadiness({ name: artist.name, bio: artist.bio, featuredAssetId: artist.featuredAssetId, websiteUrl: artist.websiteUrl });

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">My Artist Profile</h1>
          <p className="text-sm text-muted-foreground">{artworkCount} total artwork{artworkCount === 1 ? "" : "s"}</p>
        </div>
        <Button asChild><Link href="/my/artwork/new">Add artwork</Link></Button>
      </div>
      <PublishReadinessChecklist title="Artist publish readiness" ready={readiness.ready} blocking={readiness.blocking} warnings={readiness.warnings} />
      <ArtistPublishPanel
        artistSlug={artist.slug}
        isPublished={artist.isPublished}
        submissionStatus={latestSubmission?.status ?? null}
        submittedAt={latestSubmission?.submittedAt?.toISOString() ?? null}
        reviewedAt={latestSubmission?.decidedAt?.toISOString() ?? null}
        decisionReason={latestSubmission?.decisionReason ?? null}
        initialIssues={readiness.blocking.map((item) => ({ field: item.id, message: item.label }))}
      />
      <ArtistProfileForm
        initialProfile={{
          name: artist.name,
          bio: artist.bio,
          websiteUrl: artist.websiteUrl,
          instagramUrl: artist.instagramUrl,
          avatarImageUrl: artist.avatarImageUrl,
          featuredAssetId: artist.featuredAssetId,
          featuredAssetUrl: artist.featuredAsset?.url ?? null,
        }}
      />
      <ArtistGalleryManager
        initialImages={artist.images}
        initialCover={resolveArtistCoverUrl(artist)}
      />
      <ArtistVenuesPanel initialVenues={publishedVenues} />
      <ArtistFeaturedArtworksPanel
        initialFeatured={featuredArtworks.map((row) => ({ id: row.artwork.id, slug: row.artwork.slug, title: row.artwork.title, coverUrl: row.artwork.featuredAsset?.url ?? row.artwork.images[0]?.asset?.url ?? null, sortOrder: row.sortOrder }))}
        options={publishedArtworks.map((item) => ({ id: item.id, slug: item.slug, title: item.title, coverUrl: item.featuredAsset?.url ?? item.images[0]?.asset?.url ?? null, isPublished: item.isPublished }))}
      />
    </main>
  );
}
