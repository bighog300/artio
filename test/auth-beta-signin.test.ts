import test from "node:test";
import assert from "node:assert/strict";
import { authOptions } from "../lib/auth.ts";
import { db } from "../lib/db.ts";

const originalUpsert = db.user.upsert;
const originalFindUnique = db.user.findUnique;

test("auth signIn denies when beta mode enabled with empty allowlist", async () => {
  process.env.BETA_MODE = "1";
  process.env.BETA_ALLOWLIST = "";
  process.env.BETA_ALLOW_DOMAINS = "";
  process.env.BETA_ADMIN_EMAILS = "";

  db.user.upsert = (async () => ({ id: "user-1" })) as typeof db.user.upsert;

  const result = await authOptions.callbacks!.signIn!({ user: { email: "blocked@example.com", name: null, image: null } as never, account: null as never, profile: undefined, email: undefined, credentials: undefined });
  assert.equal(result, false);
});

test("auth signIn allows allowlisted email in beta mode", async () => {
  process.env.BETA_MODE = "1";
  process.env.BETA_ALLOWLIST = "allow@example.com";
  process.env.BETA_ALLOW_DOMAINS = "";
  process.env.BETA_ADMIN_EMAILS = "";

  let upsertCalled = false;
  db.user.upsert = (async () => {
    upsertCalled = true;
    return { id: "user-1" };
  }) as typeof db.user.upsert;

  const result = await authOptions.callbacks!.signIn!({ user: { email: "allow@example.com", name: null, image: null } as never, account: null as never, profile: undefined, email: undefined, credentials: undefined });
  assert.equal(result, true);
  assert.equal(upsertCalled, true);
});

test("auth signIn upgrades allowlisted admin user to ADMIN and normalizes email", async () => {
  process.env.BETA_MODE = "0";
  process.env.BETA_ALLOWLIST = "";
  process.env.BETA_ALLOW_DOMAINS = "";
  process.env.BETA_ADMIN_EMAILS = "admin@test.com";

  let captured: Parameters<typeof db.user.upsert>[0] | null = null;
  db.user.upsert = (async (input) => {
    captured = input;
    return { id: "user-admin" };
  }) as typeof db.user.upsert;

  const result = await authOptions.callbacks!.signIn!({ user: { email: "  ADMIN@Test.com ", name: "Admin", image: null } as never, account: null as never, profile: undefined, email: undefined, credentials: undefined });
  assert.equal(result, true);
  assert.equal(captured?.where.email, "admin@test.com");
  assert.equal(captured?.create.role, "ADMIN");
  assert.equal(captured?.update.role, "ADMIN");
});

test("auth jwt applies ADMIN role for allowlisted emails even if db role is USER", async () => {
  process.env.BETA_ADMIN_EMAILS = "admin@test.com";

  db.user.findUnique = (async () => ({
    id: "user-1",
    email: "admin@test.com",
    role: "USER",
    name: "Admin",
  })) as typeof db.user.findUnique;

  const token = await authOptions.callbacks!.jwt!({ token: { email: "admin@test.com" } as never, trigger: "update", user: undefined, account: undefined, profile: undefined, session: undefined, isNewUser: false });
  assert.equal(token.role, "ADMIN");
  assert.equal(token.sub, "user-1");
});

test.after(() => {
  db.user.upsert = originalUpsert;
  db.user.findUnique = originalFindUnique;
  delete process.env.BETA_MODE;
  delete process.env.BETA_ALLOWLIST;
  delete process.env.BETA_ALLOW_DOMAINS;
  delete process.env.BETA_ADMIN_EMAILS;
});
