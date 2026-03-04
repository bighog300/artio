import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { idParamSchema, zodDetails } from "@/lib/validators";
import { getCollectionPreview, getCurationQaSummary } from "@/lib/admin-curation-qa";

type Deps = {
  requireAdminUser: () => Promise<unknown>;
  getQaSummary: typeof getCurationQaSummary;
  getPreview: typeof getCollectionPreview;
};

const defaultDeps: Deps = {
  requireAdminUser: async () => (await import("@/lib/admin")).requireAdmin(),
  getQaSummary: getCurationQaSummary,
  getPreview: getCollectionPreview,
};

export async function handleAdminCurationQa(_req: NextRequest, deps: Deps = defaultDeps) {
  try {
    await deps.requireAdminUser();
    const summary = await deps.getQaSummary();
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}

export async function handleAdminCurationPreview(_req: NextRequest, params: { id: string }, deps: Deps = defaultDeps) {
  try {
    await deps.requireAdminUser();
    const parsed = idParamSchema.safeParse(params);
    if (!parsed.success) return apiError(400, "invalid_request", "Invalid collection id", zodDetails(parsed.error));
    const preview = await deps.getPreview(parsed.data.id);
    if (!preview) return apiError(404, "not_found", "Collection not found");
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
