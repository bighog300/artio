"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FollowButton } from "@/components/follows/follow-button";

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320'%3E%3Crect width='100%25' height='100%25' fill='%23f4f4f5'/%3E%3C/svg%3E";

type ArtistCardProps = {
  href: string;
  name: string;
  imageUrl?: string | null;
  image?: { url: string | null; isProcessing?: boolean; hasFailure?: boolean } | null;
  bio?: string | null;
  tags?: string[];
  artworkCount?: number;
  forSaleCount?: number;
  isAuthenticated: boolean;
  initialFollowing?: boolean;
  artistId: string;
};

export function ArtistCard({
  href,
  name,
  imageUrl,
  image,
  bio,
  tags = [],
  artworkCount,
  forSaleCount,
  isAuthenticated,
  initialFollowing = false,
  artistId,
}: ArtistCardProps) {
  const router = useRouter();
  const resolvedImageUrl = image?.url ?? imageUrl ?? null;
  const isImageProcessing = Boolean(image?.isProcessing);
  const hasImageFailure = Boolean(image?.hasFailure);

  return (
    <article className="group overflow-hidden rounded-lg border bg-card motion-safe:transition-colors motion-safe:transition-shadow motion-safe:duration-150 motion-reduce:transition-none hover:border-border hover:bg-muted/50 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2 p-3">
        <Link href={href} className="min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900">
          <div className="flex gap-3">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded bg-muted">
              <Image src={resolvedImageUrl || PLACEHOLDER} alt={name} fill sizes="80px" className="object-cover" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="line-clamp-2 font-semibold text-foreground group-hover:underline">{name}</h2>
              {isImageProcessing ? <p className="text-xs text-muted-foreground">Image processing…</p> : null}
              {hasImageFailure ? <p className="text-xs text-amber-700">Image processing issue</p> : null}
              {bio ? (
                <p className="text-sm text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">{bio}</p>
              ) : null}
            </div>
          </div>
        </Link>
        <div className="shrink-0">
          <FollowButton
            targetType="ARTIST"
            targetId={artistId}
            initialIsFollowing={initialFollowing}
            initialFollowersCount={0}
            isAuthenticated={isAuthenticated}
          />
        </div>
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1 px-3 pb-3 pt-1">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="rounded-full border bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
              onClick={() => router.push(`/events?tags=${encodeURIComponent(tag)}`)}
            >
              #{tag}
            </button>
          ))}
        </div>
      ) : null}

      {(artworkCount ?? 0) > 0 ? (
        <div className="flex items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          <span>
            {artworkCount} artwork{artworkCount === 1 ? "" : "s"}
          </span>
          {(forSaleCount ?? 0) > 0 ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 text-xs">{forSaleCount} for sale</span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
