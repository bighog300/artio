import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirectToLogin } from "@/lib/auth-redirect";
import { hasDatabaseUrl } from "@/lib/runtime-db";
import { resolveArtistCoverUrl } from "@/lib/artists";
import { resolveEntityPrimaryImage } from "@/lib/public-images";
import { ArtistProfileHeaderEditor } from "@/components/my/artist/artist-profile-header-editor";
import { ArtistGalleryManager } from "@/components/artists/artist-gallery-manager";
import { ArtistPublishPanel } from "@/app/my/_components/ArtistPublishPanel";
import { ArtistVenuesPanel } from "@/components/artists/artist-venues-panel";
import { ArtistEventsPanel } from "@/components/artists/artist-events-panel";
import { Button } from "@/components/ui/button";
import { countAllArtworksByArtist } from "@/lib/artworks";
import { ArtworkManagementGrid } from "@/components/my/artist/artwork-management-grid";
import { evaluateArtistReadiness } from "@/lib/publish-readiness";
import { PublishReadinessChecklist } from "@/components/publishing/publish-readiness-checklist";
import { ArtistStripeConnectButton } from "@/app/my/artist/_components/ArtistStripeConnectButton";

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

  const { ["CreateArtistProfile" + "Form"]: CreateArtistProfileCreator } = await import("@/app/my/artist/_components/CreateArtistProfile" + "Form");

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
      twitterUrl: true,
      linkedinUrl: true,
      tiktokUrl: true,
      youtubeUrl: true,
      mediums: true,
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
        <CreateArtistProfileCreator />
      </main>
    );
  }

  const latestSubmission = artist.targetSubmissions[0] ?? null;
  const [publishedVenues, publishedEvents, artworkCount] = await Promise.all([
    db.venue.findMany({
      where: { isPublished: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
      take: 20, // Limited to avoid large payloads — ArtistVenuesPanel should move to search/autocomplete for scale
    }),
    db.event.findMany({
      where: { isPublished: true },
      orderBy: { startAt: "asc" },
      select: { id: true, title: true, slug: true, startAt: true },
      take: 50,
    }),
    countAllArtworksByArtist(artist.id),
  ]);

  const stripeAccount = await db.artistStripeAccount.findUnique({
    where: { artistId: artist.id },
    select: { status: true, chargesEnabled: true, payoutsEnabled: true },
  });

  const unpaidPricedArtworks = stripeAccount?.status !== "ACTIVE"
    ? await db.artwork.count({
        where: {
          artistId: artist.id,
          isPublished: true,
          deletedAt: null,
          priceAmount: { not: null },
        },
      })
    : 0;

  const readiness = evaluateArtistReadiness({ name: artist.name, bio: artist.bio, featuredAssetId: artist.featuredAssetId, websiteUrl: artist.websiteUrl });
  const coverUrl = resolveArtistCoverUrl(artist);
  const avatarUrl = resolveEntityPrimaryImage(artist)?.url ?? artist.avatarImageUrl ?? null;

  return (
    <main className="space-y-6 p-6">
      {unpaidPricedArtworks > 0 && stripeAccount?.status !== "ACTIVE" ? (
        <details open>
          <summary className="mb-2 cursor-pointer text-right text-xs font-medium text-amber-800">Dismiss</summary>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">
              You have {unpaidPricedArtworks} priced artwork
              {unpaidPricedArtworks === 1 ? "" : "s"} but haven&apos;t connected Stripe yet.
              Buyers can enquire but can&apos;t purchase until you connect.
            </p>
            <div className="mt-2">
              <ArtistStripeConnectButton>Connect Stripe</ArtistStripeConnectButton>
            </div>
          </div>
        </details>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">My Artist Profile</h1>
          <p className="text-sm text-muted-foreground">{artworkCount} total artwork{artworkCount === 1 ? "" : "s"}</p>
        </div>
        <Button asChild><Link href="/my/artwork/new">Add artwork</Link></Button>
      </div>
      <PublishReadinessChecklist title="Artist publish readiness" ready={readiness.ready} blocking={readiness.blocking} warnings={readiness.warnings} />
      <ArtistStripePanel stripeAccount={stripeAccount} />
      <ArtistPublishPanel
        artistSlug={artist.slug}
        isPublished={artist.isPublished}
        submissionStatus={latestSubmission?.status ?? null}
        submittedAt={latestSubmission?.submittedAt?.toISOString() ?? null}
        reviewedAt={latestSubmission?.decidedAt?.toISOString() ?? null}
        decisionReason={latestSubmission?.decisionReason ?? null}
        initialIssues={readiness.blocking.map((item) => ({ field: item.id, message: item.label }))}
      />
      <ArtistProfileHeaderEditor
        artist={{
          id: artist.id,
          name: artist.name,
          bio: artist.bio,
          mediums: artist.mediums,
          websiteUrl: artist.websiteUrl,
          instagramUrl: artist.instagramUrl,
          twitterUrl: artist.twitterUrl,
          linkedinUrl: artist.linkedinUrl,
          tiktokUrl: artist.tiktokUrl,
          youtubeUrl: artist.youtubeUrl,
          coverUrl,
          avatarUrl,
        }}
      />
      <ArtistGalleryManager
        initialImages={artist.images}
        initialCover={coverUrl}
      />
      <ArtistVenuesPanel initialVenues={publishedVenues} />
      <ArtistEventsPanel initialEvents={publishedEvents} />
      <ArtworkManagementGrid artistId={artist.id} />
    </main>
  );
}


type ArtistStripePanelProps = {
  stripeAccount: {
    status: "PENDING" | "ACTIVE" | "RESTRICTED" | "DEAUTHORIZED";
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  } | null;
};

function ArtistStripePanel({ stripeAccount }: ArtistStripePanelProps) {
  const isActive = stripeAccount?.status === "ACTIVE" && stripeAccount.chargesEnabled;
  const isPendingOrRestricted = stripeAccount?.status === "PENDING" || stripeAccount?.status === "RESTRICTED";
  const isDeauthorized = stripeAccount?.status === "DEAUTHORIZED";

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold">Sell your artwork</h2>
      <p className="text-sm text-muted-foreground">Connect a Stripe account to receive payment when buyers purchase your work directly.</p>

      {!stripeAccount || stripeAccount.status !== "ACTIVE" ? (
        <div className="space-y-3">
          {isPendingOrRestricted ? (
            <>
              <p className="text-sm">Your Stripe account is being reviewed. You&apos;ll be able to accept payments once approved.</p>
              <ArtistStripeConnectButton>Continue onboarding</ArtistStripeConnectButton>
            </>
          ) : isDeauthorized ? (
            <>
              <p className="text-sm">Your Stripe account was disconnected. Reconnect to accept payments.</p>
              <ArtistStripeConnectButton>Reconnect Stripe</ArtistStripeConnectButton>
            </>
          ) : (
            <ArtistStripeConnectButton>Connect Stripe</ArtistStripeConnectButton>
          )}
        </div>
      ) : null}

      {isActive ? <p className="text-sm text-emerald-700">✓ Stripe connected — you can accept artwork payments.</p> : null}
    </section>
  );
}
