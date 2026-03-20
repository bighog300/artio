import { withAdminRoute } from "@/lib/admin-route";
import { handleAdminEventImageReplace } from "@/lib/admin-event-image-replace-route";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAdminRoute(async ({ actorEmail }) =>
    handleAdminEventImageReplace(req, await params, actorEmail)
  );
}
