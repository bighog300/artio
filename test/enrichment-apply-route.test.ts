import test from "node:test";
import assert from "node:assert/strict";

import { POST } from "@/app/api/admin/enrichment/runs/[id]/apply/route";
import { enrichmentApplyRouteDeps } from "@/app/api/admin/enrichment/runs/[id]/apply/deps";

type RunItem = {
  id: string;
  status: "STAGED";
  entityType: "ARTIST";
  artistId?: string;
  fieldsAfter: Record<string, unknown>;
  searchUrl?: string | null;
  artist?: { id: string; name: string; websiteUrl: string | null; instagramUrl: string | null } | null;
  createdAt?: Date;
};

function buildRun(overrides: Partial<any> = {}) {
  const item: RunItem = {
    id: "item-1",
    status: "STAGED",
    entityType: "ARTIST",
    artistId: "artist-1",
    fieldsAfter: { bio: "New bio" },
    searchUrl: "https://example.com",
    artist: { id: "artist-1", name: "Artist", websiteUrl: "https://artist.example", instagramUrl: null },
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
  };

  return {
    id: "run-1",
    status: "STAGED",
    items: [item],
    ...overrides,
  };
}

test("returns 404 when run ID does not exist", async () => {
  const original = { ...enrichmentApplyRouteDeps };
  enrichmentApplyRouteDeps.requireAdmin = async () => ({ id: "admin-1" } as never);
  enrichmentApplyRouteDeps.db = {
    enrichmentRun: {
      findUnique: async () => null,
      update: async () => {
        throw new Error("should_not_update");
      },
    },
  } as never;

  try {
    const res = await POST(new Request("http://localhost"), { params: Promise.resolve({ id: "missing" }) });
    assert.equal(res.status, 404);
  } finally {
    Object.assign(enrichmentApplyRouteDeps, original);
  }
});

test("returns 400 when run exists but status is not STAGED", async () => {
  const original = { ...enrichmentApplyRouteDeps };
  enrichmentApplyRouteDeps.requireAdmin = async () => ({ id: "admin-1" } as never);
  enrichmentApplyRouteDeps.db = {
    enrichmentRun: {
      findUnique: async () => buildRun({ status: "COMPLETED" }),
      update: async () => {
        throw new Error("should_not_update");
      },
    },
  } as never;

  try {
    const res = await POST(new Request("http://localhost"), { params: Promise.resolve({ id: "run-1" }) });
    assert.equal(res.status, 400);
  } finally {
    Object.assign(enrichmentApplyRouteDeps, original);
  }
});

test("applies artist patch with sanitized payload and marks item SUCCESS", async () => {
  const original = { ...enrichmentApplyRouteDeps };
  const artistUpdates: any[] = [];
  const itemUpdates: any[] = [];
  let runUpdate: any = null;

  enrichmentApplyRouteDeps.requireAdmin = async () => ({ id: "admin-1" } as never);
  enrichmentApplyRouteDeps.db = {
    enrichmentRun: {
      findUnique: async () => buildRun(),
      update: async ({ data }: any) => {
        runUpdate = data;
        return { id: "run-1", ...data, items: [], requestedBy: null };
      },
    },
    enrichmentRunItem: {
      update: async (args: any) => {
        itemUpdates.push(args);
        return args;
      },
    },
    artist: {
      update: async (args: any) => {
        artistUpdates.push(args);
        return { id: "artist-1", ...args.data };
      },
    },
    artwork: { update: async () => ({}) },
    venue: { update: async () => ({}) },
    event: { update: async () => ({}) },
  } as never;

  try {
    const res = await POST(new Request("http://localhost"), { params: Promise.resolve({ id: "run-1" }) });
    assert.equal(res.status, 200);
    assert.equal(artistUpdates.length, 1);
    assert.deepEqual(artistUpdates[0], {
      where: { id: "artist-1" },
      data: { bio: "New bio", completenessUpdatedAt: null },
    });
    assert.equal(itemUpdates[0].data.status, "SUCCESS");
    assert.equal(runUpdate.status, "COMPLETED");
    assert.equal(runUpdate.successItems, 1);
    assert.equal(runUpdate.failedItems, 0);
    assert.ok(runUpdate.finishedAt instanceof Date);
  } finally {
    Object.assign(enrichmentApplyRouteDeps, original);
  }
});

test("PENDING_IMAGE sentinel skips artist.update and calls importApprovedArtistImage", async () => {
  const original = { ...enrichmentApplyRouteDeps };
  const artistUpdates: any[] = [];
  const imageCalls: any[] = [];

  enrichmentApplyRouteDeps.requireAdmin = async () => ({ id: "admin-1" } as never);
  enrichmentApplyRouteDeps.importApprovedArtistImage = async (args: any) => {
    imageCalls.push(args);
    return { attached: true, warning: null, imageUrl: "https://example.com/img.jpg" };
  };
  enrichmentApplyRouteDeps.db = {
    enrichmentRun: {
      findUnique: async () => buildRun({
        items: [
          {
            id: "item-img",
            status: "STAGED",
            entityType: "ARTIST",
            artistId: "artist-1",
            fieldsAfter: { featuredAssetId: "PENDING_IMAGE" },
            searchUrl: "https://source.example",
            artist: { id: "artist-1", name: "Artist", websiteUrl: "https://artist.example", instagramUrl: null },
            createdAt: new Date("2025-01-01T00:00:00.000Z"),
          },
        ],
      }),
      update: async ({ data }: any) => ({ id: "run-1", ...data, items: [], requestedBy: null }),
    },
    enrichmentRunItem: { update: async () => ({}) },
    artist: {
      update: async (args: any) => {
        artistUpdates.push(args);
        return args;
      },
    },
    artwork: { update: async () => ({}) },
    venue: { update: async () => ({}) },
    event: { update: async () => ({}) },
  } as never;

  try {
    const res = await POST(new Request("http://localhost"), { params: Promise.resolve({ id: "run-1" }) });
    assert.equal(res.status, 200);
    assert.equal(artistUpdates.length, 0);
    assert.equal(imageCalls.length, 1);
    assert.equal(imageCalls[0].artistId, "artist-1");
  } finally {
    Object.assign(enrichmentApplyRouteDeps, original);
  }
});

test("sanitizeArtistPatch strips unknown keys", async () => {
  const original = { ...enrichmentApplyRouteDeps };
  const artistUpdates: any[] = [];

  enrichmentApplyRouteDeps.requireAdmin = async () => ({ id: "admin-1" } as never);
  enrichmentApplyRouteDeps.db = {
    enrichmentRun: {
      findUnique: async () => buildRun({
        items: [
          {
            id: "item-1",
            status: "STAGED",
            entityType: "ARTIST",
            artistId: "artist-1",
            fieldsAfter: { bio: "ok", dangerousField: "x" },
            searchUrl: "https://source.example",
            artist: { id: "artist-1", name: "Artist", websiteUrl: null, instagramUrl: null },
            createdAt: new Date("2025-01-01T00:00:00.000Z"),
          },
        ],
      }),
      update: async ({ data }: any) => ({ id: "run-1", ...data, items: [], requestedBy: null }),
    },
    enrichmentRunItem: { update: async () => ({}) },
    artist: {
      update: async (args: any) => {
        artistUpdates.push(args);
        return args;
      },
    },
    artwork: { update: async () => ({}) },
    venue: { update: async () => ({}) },
    event: { update: async () => ({}) },
  } as never;

  try {
    const res = await POST(new Request("http://localhost"), { params: Promise.resolve({ id: "run-1" }) });
    assert.equal(res.status, 200);
    assert.deepEqual(artistUpdates[0].data, { bio: "ok", completenessUpdatedAt: null });
  } finally {
    Object.assign(enrichmentApplyRouteDeps, original);
  }
});

test("per-item failure isolation marks only failed item and run still COMPLETED", async () => {
  const original = { ...enrichmentApplyRouteDeps };
  const itemUpdates: any[] = [];
  let runUpdate: any = null;

  enrichmentApplyRouteDeps.requireAdmin = async () => ({ id: "admin-1" } as never);
  enrichmentApplyRouteDeps.db = {
    enrichmentRun: {
      findUnique: async () => buildRun({
        items: [
          {
            id: "item-fail",
            status: "STAGED",
            entityType: "ARTIST",
            artistId: "artist-1",
            fieldsAfter: { bio: "bad" },
            searchUrl: "https://source.example/1",
            artist: { id: "artist-1", name: "Artist 1", websiteUrl: null, instagramUrl: null },
            createdAt: new Date("2025-01-01T00:00:00.000Z"),
          },
          {
            id: "item-ok",
            status: "STAGED",
            entityType: "ARTIST",
            artistId: "artist-2",
            fieldsAfter: { bio: "good" },
            searchUrl: "https://source.example/2",
            artist: { id: "artist-2", name: "Artist 2", websiteUrl: null, instagramUrl: null },
            createdAt: new Date("2025-01-01T00:01:00.000Z"),
          },
        ],
      }),
      update: async ({ data }: any) => {
        runUpdate = data;
        return { id: "run-1", ...data, items: [], requestedBy: null };
      },
    },
    enrichmentRunItem: {
      update: async (args: any) => {
        itemUpdates.push(args);
        return args;
      },
    },
    artist: {
      update: async ({ where, data }: any) => {
        if (where.id === "artist-1") throw new Error("db_write_failed");
        return { id: where.id, ...data };
      },
    },
    artwork: { update: async () => ({}) },
    venue: { update: async () => ({}) },
    event: { update: async () => ({}) },
  } as never;

  try {
    const res = await POST(new Request("http://localhost"), { params: Promise.resolve({ id: "run-1" }) });
    assert.equal(res.status, 200);
    assert.equal(itemUpdates.length, 2);
    const failed = itemUpdates.find((u) => u.where.id === "item-fail");
    const success = itemUpdates.find((u) => u.where.id === "item-ok");
    assert.equal(failed.data.status, "FAILED");
    assert.equal(failed.data.errorMessage, "db_write_failed");
    assert.equal(success.data.status, "SUCCESS");

    assert.equal(runUpdate.status, "COMPLETED");
    assert.equal(runUpdate.successItems, 1);
    assert.equal(runUpdate.failedItems, 1);
    assert.ok(runUpdate.finishedAt instanceof Date);
  } finally {
    Object.assign(enrichmentApplyRouteDeps, original);
  }
});

test("returns 403 when called by a non-admin user", async () => {
  const original = { ...enrichmentApplyRouteDeps };
  enrichmentApplyRouteDeps.requireAdmin = async () => {
    throw new Error("forbidden");
  };
  enrichmentApplyRouteDeps.db = {
    enrichmentRun: {
      findUnique: async () => {
        throw new Error("should_not_be_called");
      },
    },
  } as never;

  try {
    const res = await POST(new Request("http://localhost"), { params: Promise.resolve({ id: "run-1" }) });
    assert.equal(res.status, 403);
  } finally {
    Object.assign(enrichmentApplyRouteDeps, original);
  }
});
