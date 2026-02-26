import { db } from "@/lib/db";

const SITE_SETTINGS_ID = "default";

export async function getSiteSettings() {
  return db.siteSettings.upsert({
    where: { id: SITE_SETTINGS_ID },
    update: {},
    create: { id: SITE_SETTINGS_ID },
    include: { logoAsset: true },
  });
}
