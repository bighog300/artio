import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { handleImportMappingPresetList, handleImportMappingPresetSave } from "@/lib/admin-import-mapping-presets-route";
import { requireAdmin } from "@/lib/admin";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handleImportMappingPresetList(req, { requireAdminUser: requireAdmin, appDb: db });
}

export async function POST(req: NextRequest) {
  return handleImportMappingPresetSave(req, { requireAdminUser: requireAdmin, appDb: db });
}
