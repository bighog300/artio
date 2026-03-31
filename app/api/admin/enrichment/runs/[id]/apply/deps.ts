import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { importApprovedArtistImage } from "@/lib/ingest/import-approved-artist-image";
import { importApprovedArtworkImage } from "@/lib/ingest/import-approved-artwork-image";
import { importApprovedEventImage } from "@/lib/ingest/import-approved-event-image";

export type EnrichmentApplyRouteDeps = {
  requireAdmin: typeof requireAdmin;
  db: typeof db;
  importApprovedArtistImage: typeof importApprovedArtistImage;
  importApprovedArtworkImage: typeof importApprovedArtworkImage;
  importApprovedEventImage: typeof importApprovedEventImage;
};

export const enrichmentApplyRouteDeps: EnrichmentApplyRouteDeps = {
  requireAdmin,
  db,
  importApprovedArtistImage,
  importApprovedArtworkImage,
  importApprovedEventImage,
};
