const PRICE_FALLBACK_CURRENCY = "GBP";

type ArtworkRow = {
  id: string;
  title: string;
  slug: string | null;
  priceAmount: number | null;
  currency: string | null;
  artist: {
    name: string;
    user: {
      email: string;
    } | null;
  };
};

type InquiryRow = {
  id: string;
};

type InquiryDb = {
  artwork: {
    findFirst: (args: unknown) => Promise<ArtworkRow | null>;
  };
  artworkInquiry: {
    create: (args: unknown) => Promise<InquiryRow>;
  };
};

type NotifyFn = (args: {
  buyerEmail: string;
  artistEmail: string | null;
  artworkTitle: string;
  artworkSlug: string;
  artistName: string;
  buyerName: string;
  message: string | null;
  priceFormatted: string | null;
  inquiryId: string;
}) => Promise<{ deliveredTo: string }>;

function formatInquiryPrice(amount: number | null, currency: string | null) {
  if (amount == null || !currency) return null;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase() || PRICE_FALLBACK_CURRENCY,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

export async function createArtworkInquiry(args: {
  db: InquiryDb;
  artworkId: string;
  buyerName: string;
  buyerEmail: string;
  message?: string;
  notify: NotifyFn;
}) {
  const artwork = await args.db.artwork.findFirst({
    where: { id: args.artworkId, isPublished: true, deletedAt: null },
    select: {
      id: true,
      title: true,
      slug: true,
      priceAmount: true,
      currency: true,
      artist: {
        select: {
          name: true,
          user: { select: { email: true } },
        },
      },
    },
  });

  if (!artwork) return null;

  const inquiry = await args.db.artworkInquiry.create({
    data: {
      artworkId: artwork.id,
      buyerName: args.buyerName,
      buyerEmail: args.buyerEmail,
      message: args.message ?? null,
    },
    select: { id: true },
  });

  const artworkSlug = artwork.slug ?? artwork.id;
  const priceFormatted = formatInquiryPrice(artwork.priceAmount, artwork.currency);
  const notified = await args.notify({
    buyerEmail: args.buyerEmail,
    artistEmail: artwork.artist.user?.email ?? null,
    artworkTitle: artwork.title,
    artworkSlug,
    artistName: artwork.artist.name,
    buyerName: args.buyerName,
    message: args.message ?? null,
    priceFormatted,
    inquiryId: inquiry.id,
  });

  return { inquiryId: inquiry.id, deliveredTo: notified.deliveredTo };
}
