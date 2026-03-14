import { requireAdmin } from "@/lib/admin";
import { getSiteSettings } from "@/lib/site-settings/get-site-settings";
import BrandingClient from "./branding-client";

export default async function AdminBrandingPage() {
  await requireAdmin({ redirectOnFail: true });
  const settings = await getSiteSettings();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Branding</h1>
      <BrandingClient initialLogo={settings.logoAsset ? { assetId: settings.logoAsset.id, url: settings.logoAsset.url } : null} />
    </div>
  );
}
