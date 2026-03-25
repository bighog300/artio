import { type NextRequest } from "next/server";
import {
  handleAdminEntityArchive as handleAdminEntityArchiveBase,
  handleAdminEntityExport as handleAdminEntityExportBase,
  handleAdminEntityImportApply as handleAdminEntityImportApplyBase,
  handleAdminEntityImportPreview as handleAdminEntityImportPreviewBase,
  handleAdminEntityList as handleAdminEntityListBase,
  handleAdminEntityPatch as handleAdminEntityPatchBase,
  handleAdminEntityRestore as handleAdminEntityRestoreBase,
  type AdminEntitiesDeps,
} from "@/lib/admin-entity-helpers";

export function handleAdminEntityList(req: NextRequest, deps: AdminEntitiesDeps) {
  return handleAdminEntityListBase(req, "artists", deps);
}

export function handleAdminEntityPatch(req: NextRequest, params: { id: string }, deps: AdminEntitiesDeps) {
  return handleAdminEntityPatchBase(req, "artists", params, deps);
}

export function handleAdminEntityExport(req: NextRequest, deps: AdminEntitiesDeps) {
  return handleAdminEntityExportBase(req, "artists", deps);
}

export function handleAdminEntityImportPreview(req: NextRequest, deps: AdminEntitiesDeps) {
  return handleAdminEntityImportPreviewBase(req, "artists", deps);
}

export function handleAdminEntityImportApply(req: NextRequest, deps: AdminEntitiesDeps) {
  return handleAdminEntityImportApplyBase(req, "artists", deps);
}

export function handleAdminEntityArchive(req: NextRequest, params: { id: string }, deps: AdminEntitiesDeps) {
  return handleAdminEntityArchiveBase(req, "artists", params, deps);
}

export function handleAdminEntityRestore(req: NextRequest, params: { id: string }, deps: AdminEntitiesDeps) {
  return handleAdminEntityRestoreBase(req, "artists", params, deps);
}
