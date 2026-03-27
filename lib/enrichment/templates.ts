export type EnrichmentTemplateKey =
  | "ARTIST_BIO"
  | "ARTIST_IMAGE"
  | "ARTWORK_DESCRIPTION"
  | "ARTWORK_IMAGE"
  | "VENUE_DESCRIPTION"
  | "EVENT_IMAGE";

export type EnrichmentTemplate = {
  key: EnrichmentTemplateKey;
  label: string;
  entityType: "ARTIST" | "ARTWORK" | "VENUE" | "EVENT";
  gapField: "bio" | "description" | "image";
  queryTemplate: string;
};

export const ENRICHMENT_TEMPLATES: EnrichmentTemplate[] = [
  {
    key: "ARTIST_BIO",
    label: "Artist bio",
    entityType: "ARTIST",
    gapField: "bio",
    queryTemplate: "[name] artist biography",
  },
  {
    key: "ARTIST_IMAGE",
    label: "Artist image",
    entityType: "ARTIST",
    gapField: "image",
    queryTemplate: "[name] artist portrait",
  },
  {
    key: "ARTWORK_DESCRIPTION",
    label: "Artwork description",
    entityType: "ARTWORK",
    gapField: "description",
    queryTemplate: "[title] artwork",
  },
  {
    key: "ARTWORK_IMAGE",
    label: "Artwork image",
    entityType: "ARTWORK",
    gapField: "image",
    queryTemplate: "[title] artwork image",
  },
  {
    key: "VENUE_DESCRIPTION",
    label: "Venue description",
    entityType: "VENUE",
    gapField: "description",
    queryTemplate: "[name] art venue",
  },
  {
    key: "EVENT_IMAGE",
    label: "Event image",
    entityType: "EVENT",
    gapField: "image",
    queryTemplate: "[title] exhibition event",
  },
];

export const ENRICHMENT_TEMPLATE_BY_KEY: Record<EnrichmentTemplateKey, EnrichmentTemplate> =
  ENRICHMENT_TEMPLATES.reduce((acc, template) => {
    acc[template.key] = template;
    return acc;
  }, {} as Record<EnrichmentTemplateKey, EnrichmentTemplate>);
