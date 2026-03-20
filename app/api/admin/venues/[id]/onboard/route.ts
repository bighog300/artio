import { handleAdminVenueOnboard } from "@/lib/admin-venue-onboard-route";

export const runtime = "nodejs";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleAdminVenueOnboard(req, { id });
}
