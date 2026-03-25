import test from "node:test";
import assert from "node:assert/strict";
import { AdminAccessError } from "../lib/admin";
import { withAdminRoute } from "../lib/admin-route";
import { addAdminEntityImage, deleteAdminEntityImage, patchAdminEntityImage, reorderAdminEntityImages } from "../lib/admin-entity-images-route";
import { db } from "../lib/db";

type VenueImageRow = {
  id: string;
  venueId: string;
  assetId: string | null;
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  contentType: string | null;
  sizeBytes: number | null;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: Date;
};

test("withAdminRoute returns 401 when unauthenticated", async () => {
  const res = await withAdminRoute(async () => Response.json({ ok: true }), {
    requireAdminFn: async () => { throw new AdminAccessError(401); },
  });
  assert.equal((res as Response).status, 401);
});

test("withAdminRoute returns 403 for non-admin", async () => {
  const res = await withAdminRoute(async () => Response.json({ ok: true }), {
    requireAdminFn: async () => { throw new AdminAccessError(403); },
  });
  assert.equal((res as Response).status, 403);
});

function setupVenueImagesHarness() {
  const venue = { id: "11111111-1111-4111-8111-111111111111", featuredImageUrl: null as string | null, featuredAssetId: null as string | null };
  const images: VenueImageRow[] = [];
  const auditLogs: Array<{ action: string; metadata: Record<string, unknown> }> = [];
  let idCounter = 1;

  (db as any).adminAuditLog = {
    create: async ({ data }: any) => {
      auditLogs.push({ action: data.action, metadata: data.metadata ?? {} });
      return undefined;
    },
  };
  (db as any).$transaction = async (cb: any) => cb({
    venue: {
      findUnique: async ({ where }: any) => (where.id === venue.id ? { id: venue.id } : null),
      update: async ({ data }: any) => {
        venue.featuredImageUrl = data.featuredImageUrl;
        venue.featuredAssetId = data.featuredAssetId;
        return venue;
      },
    },
    venueImage: {
      findMany: async ({ where }: any = {}) => {
        let rows = [...images];
        if (where?.venueId) rows = rows.filter((x) => x.venueId === where.venueId);
        if (where?.id?.in) rows = rows.filter((x) => where.id.in.includes(x.id));
        return rows.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
      },
      updateMany: async ({ where, data }: any) => {
        images.filter((x) => x.venueId === where.venueId).forEach((x) => { x.isPrimary = data.isPrimary; });
      },
      create: async ({ data }: any) => {
        const row = {
          id: `img-${idCounter++}`,
          venueId: data.venueId,
          assetId: data.assetId ?? null,
          url: data.url,
          alt: data.alt,
          width: data.width ?? null,
          height: data.height ?? null,
          contentType: data.contentType ?? null,
          sizeBytes: data.sizeBytes ?? null,
          sortOrder: data.sortOrder,
          isPrimary: data.isPrimary,
          createdAt: new Date(idCounter),
        };
        images.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = images.find((x) => x.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      findFirst: async ({ where }: any) => images.find((x) => x.id === where.id && x.venueId === where.venueId) ?? null,
      delete: async ({ where }: any) => {
        const idx = images.findIndex((x) => x.id === where.id);
        const [removed] = images.splice(idx, 1);
        return removed;
      },
    },
    asset: {
      findUnique: async ({ where }: any) => {
        if (where.id === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa") {
          return { id: where.id, url: "https://cdn.example.com/asset.jpg", width: 900, height: 600, mime: "image/jpeg", mimeType: null, sizeBytes: 4096, byteSize: null };
        }
        return null;
      },
    },
  });

  return { venue, images, auditLogs };
}

test("reorder rejects stale/malformed payloads with strict validation", async () => {
  const { venue, images } = setupVenueImagesHarness();

  await addAdminEntityImage({ entityType: "venue", entityId: venue.id, url: "https://example.com/1.jpg", actorEmail: "admin@example.com", req: new Request("http://localhost") });
  await addAdminEntityImage({ entityType: "venue", entityId: venue.id, url: "https://example.com/2.jpg", actorEmail: "admin@example.com", req: new Request("http://localhost") });
  await addAdminEntityImage({ entityType: "venue", entityId: venue.id, url: "https://example.com/3.jpg", actorEmail: "admin@example.com", req: new Request("http://localhost") });

  const missingOne = await reorderAdminEntityImages({
    entityType: "venue",
    entityId: venue.id,
    order: [images[0]!.id, images[1]!.id],
    actorEmail: "admin@example.com",
    req: new Request("http://localhost"),
  });

  assert.equal(missingOne.status, 400);
  assert.equal((await missingOne.json()).error.code, "invalid_request");

  const duplicateId = await reorderAdminEntityImages({
    entityType: "venue",
    entityId: venue.id,
    order: [images[0]!.id, images[0]!.id, images[2]!.id],
    actorEmail: "admin@example.com",
    req: new Request("http://localhost"),
  });

  assert.equal(duplicateId.status, 400);
  assert.equal((await duplicateId.json()).error.message, "Order payload must include every image id exactly once.");
});

test("create with assetId persists asset linkage and updates featuredAssetId", async () => {
  const { venue, images } = setupVenueImagesHarness();

  const response = await addAdminEntityImage({
    entityType: "venue",
    entityId: venue.id,
    assetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    actorEmail: "admin@example.com",
    req: new Request("http://localhost"),
  });

  assert.equal(response.status, 201);
  assert.equal(images[0]?.assetId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(images[0]?.url, "https://cdn.example.com/asset.jpg");
  assert.equal(venue.featuredAssetId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  assert.equal(venue.featuredImageUrl, null);
});

test("replace updates URL while preserving order/primary and writes audit metadata", async () => {
  const { venue, images, auditLogs } = setupVenueImagesHarness();

  await addAdminEntityImage({ entityType: "venue", entityId: venue.id, url: "https://example.com/old.jpg", alt: "Existing alt", actorEmail: "admin@example.com", req: new Request("http://localhost") });
  const before = { ...images[0]! };

  const response = await patchAdminEntityImage({
    entityType: "venue",
    entityId: venue.id,
    imageId: before.id,
    url: "https://example.com/new.jpg",
    actorEmail: "admin@example.com",
    req: new Request("http://localhost"),
  });

  assert.equal(response.status, 200);
  assert.equal(images[0]!.url, "https://example.com/new.jpg");
  assert.equal(images[0]!.sortOrder, before.sortOrder);
  assert.equal(images[0]!.isPrimary, before.isPrimary);
  assert.equal(images[0]!.alt, before.alt);

  const replaceLog = auditLogs.find((entry) => entry.action === "admin.venue.image.replace");
  assert.ok(replaceLog);
  assert.equal(replaceLog?.metadata.imageId, before.id);
  assert.equal(replaceLog?.metadata.oldUrl, "https://example.com/old.jpg");
  assert.equal(replaceLog?.metadata.newUrl, "https://example.com/new.jpg");
});

test("delete normalizes sort order and setPrimary keeps single primary invariant", async () => {
  const { venue, images } = setupVenueImagesHarness();

  await addAdminEntityImage({ entityType: "venue", entityId: venue.id, url: "https://example.com/1.jpg", actorEmail: "admin@example.com", req: new Request("http://localhost") });
  await addAdminEntityImage({ entityType: "venue", entityId: venue.id, url: "https://example.com/2.jpg", actorEmail: "admin@example.com", req: new Request("http://localhost") });
  await addAdminEntityImage({ entityType: "venue", entityId: venue.id, url: "https://example.com/3.jpg", actorEmail: "admin@example.com", req: new Request("http://localhost") });

  await deleteAdminEntityImage({ entityType: "venue", entityId: venue.id, imageId: images[1]!.id, actorEmail: "admin@example.com", req: new Request("http://localhost") });

  const sortedRemaining = [...images].sort((a, b) => a.sortOrder - b.sortOrder);
  assert.deepEqual(sortedRemaining.map((x) => x.sortOrder), [0, 1]);

  await patchAdminEntityImage({ entityType: "venue", entityId: venue.id, imageId: sortedRemaining[0]!.id, isPrimary: true, actorEmail: "admin@example.com", req: new Request("http://localhost") });
  await patchAdminEntityImage({ entityType: "venue", entityId: venue.id, imageId: sortedRemaining[1]!.id, isPrimary: true, actorEmail: "admin@example.com", req: new Request("http://localhost") });

  assert.equal(images.filter((x) => x.isPrimary).length, 1);
  assert.equal(venue.featuredImageUrl, images.find((x) => x.isPrimary)?.url ?? null);
});


test("create appends sortOrder and primary assignment semantics", async () => {
  const { venue, images } = setupVenueImagesHarness();

  const firstRes = await addAdminEntityImage({
    entityType: "venue",
    entityId: venue.id,
    url: "https://example.com/first.jpg",
    actorEmail: "admin@example.com",
    req: new Request("http://localhost"),
  });
  assert.equal(firstRes.status, 201);
  assert.equal(images[0]?.sortOrder, 0);
  assert.equal(images[0]?.isPrimary, true);

  const secondRes = await addAdminEntityImage({
    entityType: "venue",
    entityId: venue.id,
    url: "https://example.com/second.jpg",
    actorEmail: "admin@example.com",
    req: new Request("http://localhost"),
  });
  assert.equal(secondRes.status, 201);
  assert.equal(images[1]?.sortOrder, 1);
  assert.equal(images[1]?.isPrimary, false);

  const thirdRes = await addAdminEntityImage({
    entityType: "venue",
    entityId: venue.id,
    url: "https://example.com/third.jpg",
    setPrimary: true,
    actorEmail: "admin@example.com",
    req: new Request("http://localhost"),
  });
  assert.equal(thirdRes.status, 201);
  assert.equal(images[2]?.sortOrder, 2);
  assert.equal(images[2]?.isPrimary, true);
  assert.equal(images.filter((row) => row.isPrimary).length, 1);
});

test("alt-required policy blocks set-primary when alt is blank", async () => {
  const { venue, images } = setupVenueImagesHarness();
  const previous = process.env.ADMIN_IMAGE_ALT_REQUIRED;
  process.env.ADMIN_IMAGE_ALT_REQUIRED = "true";

  try {
    await addAdminEntityImage({
      entityType: "venue",
      entityId: venue.id,
      url: "https://example.com/no-alt.jpg",
      actorEmail: "admin@example.com",
      req: new Request("http://localhost"),
    });

    await addAdminEntityImage({
      entityType: "venue",
      entityId: venue.id,
      url: "https://example.com/with-alt.jpg",
      alt: "Already set",
      actorEmail: "admin@example.com",
      req: new Request("http://localhost"),
    });

    const blocked = await patchAdminEntityImage({
      entityType: "venue",
      entityId: venue.id,
      imageId: images[0]!.id,
      isPrimary: true,
      actorEmail: "admin@example.com",
      req: new Request("http://localhost"),
    });

    assert.equal(blocked.status, 400);
    const blockedBody = await blocked.json();
    assert.equal(blockedBody.error.code, "invalid_request");
    assert.equal(blockedBody.error.message, "alt_required");

    const allowed = await patchAdminEntityImage({
      entityType: "venue",
      entityId: venue.id,
      imageId: images[1]!.id,
      isPrimary: true,
      actorEmail: "admin@example.com",
      req: new Request("http://localhost"),
    });

    assert.equal(allowed.status, 200);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_IMAGE_ALT_REQUIRED;
    else process.env.ADMIN_IMAGE_ALT_REQUIRED = previous;
  }
});


test("create and replace persist metadata fields", async () => {
  const { venue, images } = setupVenueImagesHarness();

  await addAdminEntityImage({
    entityType: "venue",
    entityId: venue.id,
    url: "https://example.com/meta.jpg",
    width: 1200,
    height: 800,
    contentType: "image/jpeg",
    sizeBytes: 2048,
    actorEmail: "admin@example.com",
    req: new Request("http://localhost"),
  });

  assert.equal(images[0]?.width, 1200);
  assert.equal(images[0]?.height, 800);
  assert.equal(images[0]?.contentType, "image/jpeg");

  await patchAdminEntityImage({
    entityType: "venue",
    entityId: venue.id,
    imageId: images[0]!.id,
    url: "https://example.com/meta-replaced.jpg",
    width: 640,
    height: 360,
    contentType: "image/webp",
    sizeBytes: 1024,
    actorEmail: "admin@example.com",
    req: new Request("http://localhost"),
  });

  assert.equal(images[0]?.url, "https://example.com/meta-replaced.jpg");
  assert.equal(images[0]?.width, 640);
  assert.equal(images[0]?.height, 360);
  assert.equal(images[0]?.contentType, "image/webp");
  assert.equal(images[0]?.sizeBytes, 1024);
});
