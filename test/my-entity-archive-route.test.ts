import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleMyEntityArchive, handleMyEntityRestore } from "@/lib/my-entity-archive-route";

function makeDeps() {
  let entity = { id: "11111111-1111-4111-8111-111111111111", deletedAt: null as Date | null, deletedReason: null as string | null, deletedByAdminId: null as string | null };

  return {
    get entity() {
      return entity;
    },
    deps: {
      requireAuth: async () => ({ id: "user-1" }),
      getEntityForUser: async (id: string, userId: string) => (id === entity.id && userId === "user-1" ? entity : null),
      updateEntity: async (_id: string, data: Partial<typeof entity>) => {
        entity = { ...entity, ...data };
        return entity;
      },
    },
  };
}

test("publisher can archive and restore owned entity", async () => {
  const { deps, entity } = makeDeps();

  const archiveReq = new NextRequest("http://localhost/api/my/venues/11111111-1111-4111-8111-111111111111/archive", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "cleanup" }),
  });
  const archived = await handleMyEntityArchive(archiveReq, { id: entity.id }, deps);
  assert.equal(archived.status, 200);
  const archivedBody = await archived.json();
  assert.equal(archivedBody.item.deletedReason, "cleanup");
  assert.equal(archivedBody.item.deletedByAdminId, null);
  assert.ok(archivedBody.item.deletedAt);

  const restored = await handleMyEntityRestore({ id: entity.id }, deps);
  assert.equal(restored.status, 200);
  const restoredBody = await restored.json();
  assert.equal(restoredBody.item.deletedAt, null);
  assert.equal(restoredBody.item.deletedReason, null);
});

test("archive/restore are idempotent", async () => {
  const { deps, entity } = makeDeps();

  const archiveReq = new NextRequest("http://localhost/api/my/venues/11111111-1111-4111-8111-111111111111/archive", { method: "POST" });
  const first = await handleMyEntityArchive(archiveReq, { id: entity.id }, deps);
  assert.equal(first.status, 200);
  const second = await handleMyEntityArchive(archiveReq, { id: entity.id }, deps);
  assert.equal(second.status, 200);

  const restoreFirst = await handleMyEntityRestore({ id: entity.id }, deps);
  assert.equal(restoreFirst.status, 200);
  const restoreSecond = await handleMyEntityRestore({ id: entity.id }, deps);
  assert.equal(restoreSecond.status, 200);
});

test("publisher cannot archive someone else's entity", async () => {
  const { deps } = makeDeps();
  const archiveReq = new NextRequest("http://localhost/api/my/venues/22222222-2222-4222-8222-222222222222/archive", { method: "POST" });
  const res = await handleMyEntityArchive(archiveReq, { id: "22222222-2222-4222-8222-222222222222" }, deps);
  assert.equal(res.status, 403);
});
