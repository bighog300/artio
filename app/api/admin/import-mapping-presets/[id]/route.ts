import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleImportMappingPresetDelete, handleImportMappingPresetGet } from "@/lib/admin-import-mapping-presets-route";
import { requireAdmin } from "@/lib/admin";
export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleImportMappingPresetGet(req, await context.params, { requireAdminUser: requireAdmin, appDb: db });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleImportMappingPresetDelete(req, await context.params, { requireAdminUser: requireAdmin, appDb: db });
}
