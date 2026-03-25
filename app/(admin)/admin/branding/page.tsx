import { requireAdmin } from "@/lib/admin";
import { resolveAssetDisplay } from "@/lib/assets/resolve-asset-display";
import { getSiteSettings } from "@/lib/site-settings/get-site-settings";
import BrandingClient from "./branding-client";

export default async function AdminBrandingPage() {
  await requireAdmin({ redirectOnFail: true });
  const settings = await getSiteSettings();
  const logo = settings.logoAsset
    ? {
      assetId: settings.logoAsset.id,
      image: resolveAssetDisplay({ asset: settings.logoAsset, requestedVariant: "square", allowOriginalUrl: true }),
    }
    : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Branding</h1>
      <BrandingClient initialLogo={logo} />
    </div>
  );
}
