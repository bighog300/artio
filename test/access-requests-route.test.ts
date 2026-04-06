import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleApproveAccessRequest, handleCreateAccessRequest, handleGetMyAccessRequest, handleRejectAccessRequest } from "../lib/access-requests-route.ts";
import { POST as approveRoute } from "../app/api/admin/access-request/[id]/approve/route";
import { hasGlobalVenueAccess } from "../lib/auth.ts";

type Role = "USER" | "EDITOR" | "ADMIN";
type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";
type RequestedRole = "VIEWER" | "MODERATOR" | "OPERATOR" | "ADMIN";

type UserRow = {
  id: string;
  email: string;
  role: Role;
  isTrustedPublisher?: boolean;
  trustedPublisherSince?: Date | null;
  trustedPublisherById?: string | null;
};
type RequestRow = {
  id: string;
  userId: string;
  requestedRole: RequestedRole;
  status: RequestStatus;
  reason: string | null;
  rejectionReason: string | null;
  reviewedById: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function createDeps(seed: { users: UserRow[]; requests: RequestRow[] }) {
  const state = {
    users: seed.users.map((x) => ({ ...x })),
    requests: seed.requests.map((x) => ({ ...x })),
    audit: [] as Array<{ action: string }>,
  };

  const db = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => state.users.find((u) => u.id === where.id) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: {
          role: Role;
          isTrustedPublisher?: boolean;
          trustedPublisherSince?: Date;
          trustedPublisherById?: string;
          sessionRevokedAt?: Date;
        };
      }) => {
        const user = state.users.find((u) => u.id === where.id);
        if (!user) throw new Error("missing_user");
        Object.assign(user, data);
        return { ...user };
      },
    },
    accessRequest: {
      findFirst: async ({ where }: { where: { userId: string; status?: RequestStatus } }) => {
        const rows = state.requests
          .filter((r) => r.userId === where.userId)
          .filter((r) => (where.status ? r.status === where.status : true))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows[0] ?? null;
      },
      findUnique: async ({ where }: { where: { id: string } }) => state.requests.find((r) => r.id === where.id) ?? null,
      create: async ({ data }: { data: { userId: string; requestedRole: RequestedRole; status: RequestStatus; reason: string | null } }) => {
        const row: RequestRow = {
          id: `00000000-0000-4000-8000-00000000000${state.requests.length + 1}`,
          userId: data.userId,
          requestedRole: data.requestedRole,
          status: data.status,
          reason: data.reason,
          rejectionReason: null,
          reviewedById: null,
          reviewedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.requests.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<RequestRow> }) => {
        const row = state.requests.find((r) => r.id === where.id);
        if (!row) throw new Error("not_found");
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    },
    adminAuditLog: {
      create: async ({ data }: { data: { action: string } }) => {
        state.audit.push({ action: data.action });
        return { id: `audit-${state.audit.length}` };
      },
    },
    $transaction: async <T>(fn: (tx: any) => Promise<T>) => fn(db),
  };

  return { deps: { appDb: db as any }, state };
}

test("user creates request and cannot create duplicate pending request", async () => {
  const { deps, state } = createDeps({ users: [{ id: "u1", email: "u1@example.com", role: "USER" }], requests: [] });

  const createReq = new NextRequest("http://localhost/api/access/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestedRole: "operator", reason: "Need publish access" }),
  });
  const first = await handleCreateAccessRequest(createReq, { id: "u1", email: "u1@example.com", role: "USER" }, deps);
  assert.equal(first.status, 200);
  assert.equal(state.requests[0]?.status, "PENDING");

  const createReqSecond = new NextRequest("http://localhost/api/access/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestedRole: "operator", reason: "Need publish access" }),
  });
  const second = await handleCreateAccessRequest(createReqSecond, { id: "u1", email: "u1@example.com", role: "USER" }, deps);
  assert.equal(second.status, 409);
});


test("returns an error when a pending request already exists for the user", async () => {
  const { deps } = createDeps({
    users: [{ id: "u1", email: "u1@example.com", role: "USER" }],
    requests: [],
  });

  const firstReq = new NextRequest("http://localhost/api/access/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestedRole: "moderator" }),
  });
  const first = await handleCreateAccessRequest(firstReq, { id: "u1", email: "u1@example.com", role: "USER" }, deps);
  assert.equal(first.status, 200);

  const secondReq = new NextRequest("http://localhost/api/access/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestedRole: "operator" }),
  });
  const second = await handleCreateAccessRequest(secondReq, { id: "u1", email: "u1@example.com", role: "USER" }, deps);
  assert.equal(second.status, 409);

  const body = await second.json();
  assert.match(body.error?.message ?? "", /pending .*request/i);
});

test("user sees latest request status", async () => {
  const { deps } = createDeps({
    users: [{ id: "u1", email: "u1@example.com", role: "USER" }],
    requests: [
      { id: "old", userId: "u1", requestedRole: "OPERATOR", status: "REJECTED", reason: null, rejectionReason: "x", reviewedById: "a1", reviewedAt: new Date("2026-01-01T00:00:00.000Z"), createdAt: new Date("2026-01-01T00:00:00.000Z"), updatedAt: new Date("2026-01-01T00:00:00.000Z") },
      { id: "new", userId: "u1", requestedRole: "ADMIN", status: "PENDING", reason: null, rejectionReason: null, reviewedById: null, reviewedAt: null, createdAt: new Date("2026-02-01T00:00:00.000Z"), updatedAt: new Date("2026-02-01T00:00:00.000Z") },
    ],
  });

  const res = await handleGetMyAccessRequest({ id: "u1", email: "u1@example.com", role: "USER" }, deps);
  const body = await res.json();
  assert.equal(body.state, "PENDING");
  assert.equal(body.request.id, "new");
});

test("admin approves request updates user role and blocks double-approval", async () => {
  const { deps, state } = createDeps({
    users: [{ id: "u1", email: "u1@example.com", role: "USER" }],
    requests: [{ id: "00000000-0000-4000-8000-000000000111", userId: "u1", requestedRole: "OPERATOR", status: "PENDING", reason: null, rejectionReason: null, reviewedById: null, reviewedAt: null, createdAt: new Date(), updatedAt: new Date() }],
  });

  const req = new NextRequest("http://localhost/api/admin/access-request/00000000-0000-4000-8000-000000000111/approve", { method: "POST" });
  const approved = await handleApproveAccessRequest(req, Promise.resolve({ id: "00000000-0000-4000-8000-000000000111" }), { id: "admin-1", email: "admin@example.com", role: "ADMIN" }, deps);
  assert.equal(approved.status, 200);
  assert.equal(state.users[0]?.role, "EDITOR");
  assert.equal(state.users[0]?.isTrustedPublisher, true);
  assert.equal(hasGlobalVenueAccess(state.users[0]?.role), true);

  const second = await handleApproveAccessRequest(req, Promise.resolve({ id: "00000000-0000-4000-8000-000000000111" }), { id: "admin-1", email: "admin@example.com", role: "ADMIN" }, deps);
  assert.equal(second.status, 409);
});

test("admin rejects request without changing user role", async () => {
  const { deps, state } = createDeps({
    users: [{ id: "u1", email: "u1@example.com", role: "USER" }],
    requests: [{ id: "00000000-0000-4000-8000-000000000222", userId: "u1", requestedRole: "ADMIN", status: "PENDING", reason: null, rejectionReason: null, reviewedById: null, reviewedAt: null, createdAt: new Date(), updatedAt: new Date() }],
  });

  const req = new NextRequest("http://localhost/api/admin/access-request/00000000-0000-4000-8000-000000000222/reject", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rejectionReason: "Missing justification" }),
  });
  const rejected = await handleRejectAccessRequest(req, Promise.resolve({ id: "00000000-0000-4000-8000-000000000222" }), { id: "admin-1", email: "admin@example.com", role: "ADMIN" }, deps);
  assert.equal(rejected.status, 200);
  assert.equal(state.users[0]?.role, "USER");
  assert.equal(state.requests[0]?.status, "REJECTED");
});

test("deleted user cannot create request", async () => {
  const { deps } = createDeps({ users: [], requests: [] });
  const req = new NextRequest("http://localhost/api/access/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestedRole: "operator" }),
  });
  const res = await handleCreateAccessRequest(req, { id: "missing", email: "x@example.com", role: "USER" }, deps);
  assert.equal(res.status, 403);
});

test("non-admin cannot approve via API route", async () => {
  const req = new NextRequest("http://localhost/api/admin/access-request/00000000-0000-4000-8000-000000000000/approve", { method: "POST" });
  const res = await approveRoute(req, { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }) });
  assert.notEqual(res.status, 200);
});
