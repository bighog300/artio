import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const SITE_SETTINGS_ID = "default";

type SiteSettingsWithLogo = Prisma.SiteSettingsGetPayload<{ include: { logoAsset: true } }>;

export async function getSiteSettings(): Promise<SiteSettingsWithLogo> {
  try {
    const existing = await db.siteSettings.findUnique({
      where: { id: SITE_SETTINGS_ID },
      include: { logoAsset: true },
    });

    if (existing) return existing;

    return await db.siteSettings.create({
      data: { id: SITE_SETTINGS_ID },
      include: { logoAsset: true },
    });
  } catch (err) {
    console.error("[getSiteSettings] DB error:", err);
    return { id: SITE_SETTINGS_ID, logoAsset: null } as SiteSettingsWithLogo;
  }
}
