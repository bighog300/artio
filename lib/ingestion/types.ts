export type ExtractedEvent = {
  title: string;
  description?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
  sourceUrl: string;
  artistNames: string[];
  artworks: Array<{
    title: string;
    medium?: string | null;
    year?: number | null;
  }>;
};

export type ExtractedArtist = {
  name: string;
  normalizedName: string;
  websiteUrl?: string | null;
  instagramUrl?: string | null;
  confidence: number;
};

export type ExtractedArtwork = {
  title: string;
  artistName?: string | null;
  sourceUrl: string;
  confidence: number;
};

export type ExtractionResult = {
  events: ExtractedEvent[];
  artists: ExtractedArtist[];
  artworks: ExtractedArtwork[];
  contentHash: string;
};
