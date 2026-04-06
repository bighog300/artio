import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleAdminUsersSearch, handleAdminUserRoleUpdate, handleAdminTrustedPublisherUpdate } from "../lib/admin-users-route.ts";

type Role = "USER" | "EDITOR" | "ADMIN";

type MockUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  createdAt?: Date;
  isTrustedPublisher?: boolean;
  trustedPublisherSince?: Date | null;
  trustedPublisherById?: string | null;
  sessionRevokedAt?: Date | null;
};

function buildDeps(users: MockUser[]) {
  const auditEntries: Array<Record<string, unknown>> = [];

  const tx = {
    user: {
      count: async ({ where }: { where: { role: Role } }) => users.filter((user) => user.role === where.role).length,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = users.findIndex((user) => user.id === where.id);
        if (idx < 0) throw new Error("not_found");
        users[idx] = { ...users[idx], ...(data as never) };
        return {
          id: users[idx].id,
          email: users[idx].email,
          name: users[idx].name,
          role: users[idx].role,
          isTrustedPublisher: users[idx].isTrustedPublisher ?? false,
          trustedPublisherSince: users[idx].trustedPublisherSince ?? null,
          trustedPublisherById: users[idx].trustedPublisherById ?? null,
          trustedPublisherBy: null,
        };
      },
    },
    adminAuditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEntries.push(data);
      },
    },
  };

  const appDb = {
    user: {
      findMany: async ({ where }: { where?: { OR: Array<{ email?: { contains: string } ; name?: { contains: string } }> } }) => {
        const query = where?.OR?.[0]?.email?.contains ?? where?.OR?.[1]?.name?.contains ?? "";
        const lowered = query.toLowerCase();
        return users
          .filter((user) => {
            if (!query) return true;
            return user.email.toLowerCase().includes(lowered) || (user.name ?? "").toLowerCase().includes(lowered);
          })
          .map((user) => ({ id: user.id, email: user.email, name: user.name, role: user.role, isTrustedPublisher: user.isTrustedPublisher ?? false, trustedPublisherSince: user.trustedPublisherSince ?? null, trustedPublisherById: user.trustedPublisherById ?? null, trustedPublisherBy: null, createdAt: user.createdAt ?? new Date() }));
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const user = users.find((item) => item.id === where.id);
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role, isTrustedPublisher: user.isTrustedPublisher ?? false, trustedPublisherSince: user.trustedPublisherSince ?? null, trustedPublisherById: user.trustedPublisherById ?? null, trustedPublisherBy: null };
      },
    },
    adminAuditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEntries.push(data);
      },
    },
    $transaction: async <T>(fn: (innerTx: typeof tx) => Promise<T>) => fn(tx),
  } as const;

  return { appDb, auditEntries };
}

test("GET /api/admin/users allows admins to search users", async () => {
  const { appDb } = buildDeps([
    { id: "11111111-1111-4111-8111-111111111111", email: "alice@example.com", name: "Alice", role: "USER" },
    { id: "22222222-2222-4222-8222-222222222222", email: "bob@example.com", name: "Bob", role: "EDITOR" },
  ]);

  const req = new NextRequest("http://localhost/api/admin/users?query=ali");
  const res = await handleAdminUsersSearch(req, {
    requireAdminUser: async () => ({ id: "admin-1", email: "admin@example.com", role: "ADMIN" }),
    appDb: appDb as never,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.users.length, 1);
  assert.equal(body.users[0].email, "alice@example.com");
});

test("GET /api/admin/users returns 403 for non-admin", async () => {
  const { appDb } = buildDeps([]);
  const req = new NextRequest("http://localhost/api/admin/users");

  const res = await handleAdminUsersSearch(req, {
    requireAdminUser: async () => {
      throw new Error("forbidden");
    },
    appDb: appDb as never,
  });

  assert.equal(res.status, 403);
});

test("PATCH /api/admin/users/[id]/role lets admin demote without manual override", async () => {
  const { appDb } = buildDeps([
    { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com", name: "Admin", role: "ADMIN" },
    { id: "22222222-2222-4222-8222-222222222222", email: "editor@example.com", name: "Editor", role: "EDITOR" },
  ]);

  const req = new NextRequest("http://localhost/api/admin/users/22222222-2222-4222-8222-222222222222/role", {
    method: "PATCH",
    body: JSON.stringify({ role: "USER" }),
    headers: { "content-type": "application/json" },
  });

  const res = await handleAdminUserRoleUpdate(req, { id: "22222222-2222-4222-8222-222222222222" }, {
    requireAdminUser: async () => ({ id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com", role: "ADMIN" }),
    appDb: appDb as never,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.role, "USER");
});

test("PATCH /api/admin/users/[id]/role blocks elevation without manual override", async () => {
  const { appDb } = buildDeps([
    { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com", name: "Admin", role: "ADMIN" },
    { id: "22222222-2222-4222-8222-222222222222", email: "user@example.com", name: "User", role: "USER" },
  ]);

  const req = new NextRequest("http://localhost/api/admin/users/22222222-2222-4222-8222-222222222222/role", {
    method: "PATCH",
    body: JSON.stringify({ role: "EDITOR" }),
    headers: { "content-type": "application/json" },
  });

  const res = await handleAdminUserRoleUpdate(req, { id: "22222222-2222-4222-8222-222222222222" }, {
    requireAdminUser: async () => ({ id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com", role: "ADMIN" }),
    appDb: appDb as never,
  });

  assert.equal(res.status, 409);
});

test("PATCH /api/admin/users/[id]/role prevents demoting the last admin", async () => {
  const { appDb } = buildDeps([
    { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com", name: "Admin", role: "ADMIN" },
  ]);

  const req = new NextRequest("http://localhost/api/admin/users/11111111-1111-4111-8111-111111111111/role", {
    method: "PATCH",
    body: JSON.stringify({ role: "USER" }),
    headers: { "content-type": "application/json" },
  });

  const res = await handleAdminUserRoleUpdate(req, { id: "11111111-1111-4111-8111-111111111111" }, {
    requireAdminUser: async () => ({ id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com", role: "ADMIN" }),
    appDb: appDb as never,
  });

  assert.equal(res.status, 409);
});

test("PATCH /api/admin/users/[id]/role writes an audit log entry on success", async () => {
  const { appDb, auditEntries } = buildDeps([
    { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com", name: "Admin", role: "ADMIN" },
    { id: "22222222-2222-4222-8222-222222222222", email: "user@example.com", name: "User", role: "USER" },
  ]);

  const req = new NextRequest("http://localhost/api/admin/users/22222222-2222-4222-8222-222222222222/role", {
    method: "PATCH",
    body: JSON.stringify({ role: "EDITOR", manualOverride: true }),
    headers: { "content-type": "application/json", "user-agent": "node-test" },
  });

  const res = await handleAdminUserRoleUpdate(req, { id: "22222222-2222-4222-8222-222222222222" }, {
    requireAdminUser: async () => ({ id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com", role: "ADMIN" }),
    appDb: appDb as never,
  });

  assert.equal(res.status, 200);
  assert.equal(auditEntries.length, 1);
  assert.equal(auditEntries[0].action, "USER_ROLE_CHANGED_MANUAL_OVERRIDE");
});


test("PATCH /api/admin/users/[id]/trusted-publisher grants capability and writes audit", async () => {
  const { appDb, auditEntries } = buildDeps([
    { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com", name: "Admin", role: "ADMIN" },
    { id: "22222222-2222-4222-8222-222222222222", email: "user@example.com", name: "User", role: "EDITOR", isTrustedPublisher: false },
  ]);

  const req = new NextRequest("http://localhost/api/admin/users/22222222-2222-4222-8222-222222222222/trusted-publisher", {
    method: "PATCH",
    body: JSON.stringify({ enabled: true }),
    headers: { "content-type": "application/json", "user-agent": "node-test" },
  });

  const res = await handleAdminTrustedPublisherUpdate(req, { id: "22222222-2222-4222-8222-222222222222" }, {
    requireAdminUser: async () => ({ id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com", role: "ADMIN" }),
    appDb: appDb as never,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.isTrustedPublisher, true);
  assert.equal(auditEntries.at(-1)?.action, "USER_TRUSTED_PUBLISHER_GRANTED");
});

test("PATCH /api/admin/users/[id]/trusted-publisher revoke keeps grant timestamp", async () => {
  const grantedAt = new Date("2026-01-01T00:00:00.000Z");
  const { appDb, auditEntries } = buildDeps([
    { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com", name: "Admin", role: "ADMIN" },
    { id: "22222222-2222-4222-8222-222222222222", email: "user@example.com", name: "User", role: "EDITOR", isTrustedPublisher: true, trustedPublisherSince: grantedAt, trustedPublisherById: "11111111-1111-4111-8111-111111111111" },
  ]);

  const req = new NextRequest("http://localhost/api/admin/users/22222222-2222-4222-8222-222222222222/trusted-publisher", {
    method: "PATCH",
    body: JSON.stringify({ enabled: false }),
    headers: { "content-type": "application/json" },
  });

  const res = await handleAdminTrustedPublisherUpdate(req, { id: "22222222-2222-4222-8222-222222222222" }, {
    requireAdminUser: async () => ({ id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com", role: "ADMIN" }),
    appDb: appDb as never,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.isTrustedPublisher, false);
  assert.equal(body.user.trustedPublisherSince, grantedAt.toISOString());
  assert.equal(auditEntries.at(-1)?.action, "USER_TRUSTED_PUBLISHER_REVOKED");
});
