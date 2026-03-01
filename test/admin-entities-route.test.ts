import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  handleAdminEntityExport,
  handleAdminEntityImportApply,
  handleAdminEntityImportPreview,
  handleAdminEntityArchive,
  handleAdminEntityList,
  handleAdminEntityPatch,
  handleAdminEntityRestore,
} from "../lib/admin-entities-route.ts";

function buildVenueDeps() {
  const venues = [
    { id: "11111111-1111-4111-8111-111111111111", name: "Venue A", slug: "venue-a", city: "NY", postcode: "10001", country: "US", status: "IN_REVIEW", isPublished: false, websiteUrl: null, addressLine1: null, addressLine2: null, description: null, featuredAssetId: null, deletedAt: null, deletedByAdminId: null, deletedReason: null },
  ];
  const auditEntries: Array<Record<string, unknown>> = [];

  const tx = {
    venue: {
      findUnique: async ({ where }: { where: { id?: string; slug?: string } }) => venues.find((v) => (where.id ? v.id === where.id : v.slug === where.slug)) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = venues.findIndex((v) => v.id === where.id);
        if (idx < 0) throw new Error("not_found");
        venues[idx] = { ...venues[idx], ...data };
        return venues[idx];
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { ...venues[0], ...data, id: "22222222-2222-4222-8222-222222222222" };
        venues.push(created as never);
        return created;
      },
      findMany: async ({ where }: { where?: { deletedAt?: null | { not: null }; status?: string } } = {}) => venues.filter((v) => {
        const deletedMatches = where?.deletedAt === null ? v.deletedAt == null : (where?.deletedAt && "not" in where.deletedAt ? v.deletedAt != null : true);
        const statusMatches = where?.status ? v.status === where.status : true;
        return deletedMatches && statusMatches;
      }),
      count: async ({ where }: { where?: { deletedAt?: null | { not: null }; status?: string } } = {}) => venues.filter((v) => {
        const deletedMatches = where?.deletedAt === null ? v.deletedAt == null : (where?.deletedAt && "not" in where.deletedAt ? v.deletedAt != null : true);
        const statusMatches = where?.status ? v.status === where.status : true;
        return deletedMatches && statusMatches;
      }).length,
      groupBy: async ({ where }: { where?: { deletedAt?: null | { not: null } } } = {}) => {
        const filtered = venues.filter((v) => (where?.deletedAt === null ? v.deletedAt == null : (where?.deletedAt && "not" in where.deletedAt ? v.deletedAt != null : true)));
        const grouped = new Map<string, number>();
        for (const venue of filtered) grouped.set(venue.status, (grouped.get(venue.status) ?? 0) + 1);
        return Array.from(grouped.entries()).map(([status, count]) => ({ status, _count: { _all: count } }));
      },
    },
    adminAuditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEntries.push(data);
      },
    },
  };

  const appDb = {
    venue: tx.venue,
    event: { count: async () => 0, findMany: async () => [], findUnique: async () => null, update: async () => null, create: async () => null, groupBy: async () => [] },
    artist: { count: async () => 0, findMany: async () => [], findUnique: async () => null, update: async () => null, create: async () => null },
    adminAuditLog: tx.adminAuditLog,
    $transaction: async <T>(fn: (inner: typeof tx) => Promise<T>) => fn(tx),
  } as const;

  return { appDb, auditEntries, venues };
}

const adminUser = async () => ({ id: "admin-id", email: "admin@example.com", role: "ADMIN" as const });

test("admin entity list returns 403 for non-admin", async () => {
  const { appDb } = buildVenueDeps();
  const req = new NextRequest("http://localhost/api/admin/venues");
  const res = await handleAdminEntityList(req, "venues", { requireAdminUser: async () => { throw new Error("forbidden"); }, appDb: appDb as never });
  assert.equal(res.status, 403);
});

test("inline patch rejects unknown fields", async () => {
  const { appDb } = buildVenueDeps();
  const req = new NextRequest("http://localhost/api/admin/venues/11111111-1111-4111-8111-111111111111", {
    method: "PATCH",
    body: JSON.stringify({ unknown: "nope" }),
    headers: { "content-type": "application/json" },
  });

  const res = await handleAdminEntityPatch(req, "venues", { id: "11111111-1111-4111-8111-111111111111" }, { requireAdminUser: adminUser, appDb: appDb as never });
  assert.equal(res.status, 400);
});

test("import preview catches mapping/validation errors", async () => {
  const { appDb } = buildVenueDeps();
  const form = new FormData();
  form.set("file", new File(["name,slug,isPublished\n,venue-b,not-bool"], "venues.csv", { type: "text/csv" }));
  form.set("mapping", JSON.stringify({ name: "name", slug: "slug", isPublished: "isPublished" }));
  form.set("options", JSON.stringify({ matchBy: "slug" }));
  const req = new NextRequest("http://localhost/api/admin/venues/import/preview", { method: "POST", body: form });

  const res = await handleAdminEntityImportPreview(req, "venues", { requireAdminUser: adminUser, appDb: appDb as never });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.summary.invalid, 1);
});

test("import apply updates record and creates audit log", async () => {
  const { appDb, auditEntries, venues } = buildVenueDeps();
  const form = new FormData();
  form.set("file", new File(["slug,name\nvenue-a,Venue A Updated"], "venues.csv", { type: "text/csv" }));
  form.set("mapping", JSON.stringify({ slug: "slug", name: "name" }));
  form.set("options", JSON.stringify({ matchBy: "slug" }));
  const req = new NextRequest("http://localhost/api/admin/venues/import/apply", {
    method: "POST",
    body: form,
    headers: { "user-agent": "node-test" },
  });

  const res = await handleAdminEntityImportApply(req, "venues", { requireAdminUser: adminUser, appDb: appDb as never });
  assert.equal(res.status, 200);
  assert.equal(venues[0].name, "Venue A Updated");
  assert.equal(auditEntries.length, 1);
  assert.equal(auditEntries[0].action, "ADMIN_IMPORT_APPLIED");
});



test("archive and restore venue are idempotent", async () => {
  const { appDb, venues } = buildVenueDeps();
  const archiveReq = new NextRequest("http://localhost/api/admin/venues/11111111-1111-4111-8111-111111111111/archive", { method: "POST", body: JSON.stringify({ reason: "spam" }), headers: { "content-type": "application/json" } });
  const archiveRes = await handleAdminEntityArchive(archiveReq, "venues", { id: "11111111-1111-4111-8111-111111111111" }, { requireAdminUser: adminUser, appDb: appDb as never });
  assert.equal(archiveRes.status, 200);
  assert.ok(venues[0]?.deletedAt);

  const archiveAgain = await handleAdminEntityArchive(archiveReq, "venues", { id: "11111111-1111-4111-8111-111111111111" }, { requireAdminUser: adminUser, appDb: appDb as never });
  assert.equal(archiveAgain.status, 200);

  const restoreReq = new NextRequest("http://localhost/api/admin/venues/11111111-1111-4111-8111-111111111111/restore", { method: "POST" });
  const restoreRes = await handleAdminEntityRestore(restoreReq, "venues", { id: "11111111-1111-4111-8111-111111111111" }, { requireAdminUser: adminUser, appDb: appDb as never });
  assert.equal(restoreRes.status, 200);
  assert.equal(venues[0]?.deletedAt ?? null, null);
});

test("admin list supports showArchived", async () => {
  const { appDb, venues } = buildVenueDeps();
  venues[0] = { ...venues[0], deletedAt: new Date() };
  const hiddenRes = await handleAdminEntityList(new NextRequest("http://localhost/api/admin/venues"), "venues", { requireAdminUser: adminUser, appDb: appDb as never });
  const hiddenBody = await hiddenRes.json();
  assert.equal(hiddenBody.items.length, 0);

  const shownRes = await handleAdminEntityList(new NextRequest("http://localhost/api/admin/venues?showArchived=1"), "venues", { requireAdminUser: adminUser, appDb: appDb as never });
  const shownBody = await shownRes.json();
  assert.equal(shownBody.items.length, 1);
});
test("export returns csv headers", async () => {
  const { appDb } = buildVenueDeps();
  const req = new NextRequest("http://localhost/api/admin/venues/export");
  const res = await handleAdminEntityExport(req, "venues", { requireAdminUser: adminUser, appDb: appDb as never });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text.split("\n")[0], /^id,name,slug/);
});

test("admin list includes computed publish blockers", async () => {
  const { appDb } = buildVenueDeps();
  const req = new NextRequest("http://localhost/api/admin/venues");
  const res = await handleAdminEntityList(req, "venues", { requireAdminUser: adminUser, appDb: appDb as never });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.items[0].publishBlockers));
  assert.equal(body.items[0].publishBlockers.length > 0, true);
});

test("venue patch rejects invalid moderation transition", async () => {
  const { appDb } = buildVenueDeps();
  const req = new NextRequest("http://localhost/api/admin/venues/11111111-1111-4111-8111-111111111111", {
    method: "PATCH",
    body: JSON.stringify({ status: "PUBLISHED" }),
    headers: { "content-type": "application/json" },
  });

  const res = await handleAdminEntityPatch(req, "venues", { id: "11111111-1111-4111-8111-111111111111" }, { requireAdminUser: adminUser, appDb: appDb as never });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, "invalid_transition");
});
