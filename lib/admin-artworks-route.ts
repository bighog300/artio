import { type NextRequest } from "next/server";
import {
  handleAdminEntityArchive as handleAdminEntityArchiveBase,
  handleAdminEntityGet as handleAdminEntityGetBase,
  handleAdminEntityList as handleAdminEntityListBase,
  handleAdminEntityPatch as handleAdminEntityPatchBase,
  handleAdminEntityRestore as handleAdminEntityRestoreBase,
  type AdminEntitiesDeps,
} from "@/lib/admin-entity-helpers";

export function handleAdminEntityList(req: NextRequest, deps: AdminEntitiesDeps) {
  return handleAdminEntityListBase(req, "artwork", deps);
}

export function handleAdminEntityPatch(req: NextRequest, params: { id: string }, deps: AdminEntitiesDeps) {
  return handleAdminEntityPatchBase(req, "artwork", params, deps);
}

export function handleAdminEntityGet(req: NextRequest, params: { id: string }, deps: AdminEntitiesDeps) {
  return handleAdminEntityGetBase(req, "artwork", params, deps);
}

export function handleAdminEntityArchive(req: NextRequest, params: { id: string }, deps: AdminEntitiesDeps) {
  return handleAdminEntityArchiveBase(req, "artwork", params, deps);
}

export function handleAdminEntityRestore(req: NextRequest, params: { id: string }, deps: AdminEntitiesDeps) {
  return handleAdminEntityRestoreBase(req, "artwork", params, deps);
}
