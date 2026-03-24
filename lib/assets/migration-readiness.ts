import type { PrismaClient } from "@prisma/client";

export async function getAssetMigrationReadiness(dbClient: PrismaClient) {
  const [totalAssets, readyAssets, withVariants, legacyEventImagesWithoutAsset] = await Promise.all([
    dbClient.asset.count(),
    dbClient.asset.count({ where: { processingStatus: "READY" } }),
    dbClient.asset.count({ where: { variants: { some: {} } } }),
    dbClient.eventImage.count({ where: { assetId: null, url: { not: "" } } }),
  ]);

  return {
    totalAssets,
    readyAssets,
    withVariants,
    legacyEventImagesWithoutAsset,
    readyRatio: totalAssets > 0 ? readyAssets / totalAssets : 0,
  };
}
