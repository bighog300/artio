import { handleAdminVenueGeocode, adminVenueGeocodeDeps } from "@/lib/admin-venue-geocode";

export const runtime = "nodejs";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleAdminVenueGeocode(params, adminVenueGeocodeDeps);
}
