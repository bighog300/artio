import type { Metadata } from "next";

type DetailKind = "event" | "venue" | "artist";

type MetadataInput = {
  kind: DetailKind;
  slug: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
};

type EventJsonLdInput = {
  title: string;
  description?: string | null;
  startAt: Date;
  endAt?: Date | null;
  detailUrl: string;
  imageUrl?: string | null;
  venue?: {
    name: string;
    address?: string | null;
  } | null;
};

type VenueJsonLdInput = {
  name: string;
  description?: string | null;
  detailUrl: string;
  imageUrl?: string | null;
  address?: string | null;
  websiteUrl?: string | null;
};

type ArtistJsonLdInput = {
  name: string;
  description?: string | null;
  detailUrl: string;
  imageUrl?: string | null;
  websiteUrl?: string | null;
};

type ArtworkJsonLdInput = {
  title: string;
  artistName: string;
  description?: string | null;
  detailUrl: string;
  imageUrl?: string | null;
  year?: number | null;
  medium?: string | null;
  priceAmount?: number | null;
  currency?: string | null;
};

const FALLBACK_COPY: Record<DetailKind, { title: string; description: string; path: string }> = {
  event: {
    title: "Event details",
    description: "Discover event details, schedule, and venue information on Artpulse.",
    path: "/events",
  },
  venue: {
    title: "Venue details",
    description: "Explore venue profiles, upcoming events, and practical details on Artpulse.",
    path: "/venues",
  },
  artist: {
    title: "Artist details",
    description: "Browse artist profiles and related events on Artpulse.",
    path: "/artists",
  },
};

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function getDetailUrl(kind: DetailKind, slug: string) {
  return `${getSiteUrl()}${FALLBACK_COPY[kind].path}/${slug}`;
}

export function buildDetailMetadata(input: MetadataInput): Metadata {
  const fallback = FALLBACK_COPY[input.kind];
  const title = input.title?.trim() || `${fallback.title} | Artpulse`;
  const description = input.description?.trim() || fallback.description;
  const url = getDetailUrl(input.kind, input.slug);
  const images = input.imageUrl ? [input.imageUrl] : undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images,
    },
  };
}

export function buildEventJsonLd(input: EventJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: input.title,
    description: input.description || undefined,
    url: input.detailUrl,
    image: input.imageUrl ? [input.imageUrl] : undefined,
    startDate: input.startAt.toISOString(),
    endDate: input.endAt?.toISOString(),
    location: input.venue
      ? {
          "@type": "Place",
          name: input.venue.name,
          address: input.venue.address || undefined,
        }
      : undefined,
  };
}

export function buildVenueJsonLd(input: VenueJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    name: input.name,
    description: input.description || undefined,
    url: input.detailUrl,
    image: input.imageUrl ? [input.imageUrl] : undefined,
    address: input.address || undefined,
    sameAs: input.websiteUrl || undefined,
  };
}

export function buildArtistJsonLd(input: ArtistJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: input.name,
    description: input.description || undefined,
    url: input.detailUrl,
    image: input.imageUrl ? [input.imageUrl] : undefined,
    sameAs: input.websiteUrl || undefined,
  };
}

export function buildArtworkJsonLd(input: ArtworkJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "VisualArtwork",
    name: input.title,
    description: input.description || undefined,
    url: input.detailUrl,
    image: input.imageUrl ? [input.imageUrl] : undefined,
    creator: { "@type": "Person", name: input.artistName },
    dateCreated: input.year ? String(input.year) : undefined,
    artMedium: input.medium || undefined,
    offers:
      input.priceAmount != null && input.currency
        ? {
            "@type": "Offer",
            price: input.priceAmount,
            priceCurrency: input.currency,
            availability: "https://schema.org/InStock",
          }
        : undefined,
  };
}
