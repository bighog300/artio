import { getSiteSettings } from "@/lib/site-settings/get-site-settings";

export async function getPublicBranding() {
  const settings = await getSiteSettings();
  return {
    logoUrl: settings.logoAsset?.url ?? null,
  };
}
