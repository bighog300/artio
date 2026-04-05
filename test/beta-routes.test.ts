import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleAdminPatchRequestStatus, handleFeedback, handleRequestAccess } from "../lib/beta/routes.ts";
import { db } from "../lib/db.ts";

const originalRequestUpsert = db.betaAccessRequest.upsert;
const originalRequestUpdate = db.betaAccessRequest.update;
const originalFeedbackCreate = db.betaFeedback.create;
const originalTransaction = db.$transaction;

test("POST /api/beta/request-access validates and upserts", async () => {
  let upsertedEmail = "";
  db.betaAccessRequest.upsert = (async (input: { create: { email: string } }) => {
    upsertedEmail = input.create.email;
    return { id: "id-1", email: input.create.email, createdAt: new Date() };
  }) as typeof db.betaAccessRequest.upsert;

  const req = new NextRequest("http://localhost/api/beta/request-access", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.40" },
    body: JSON.stringify({ email: " User@Example.com ", note: "please" }),
  });

  const res = await handleRequestAccess(req, "user-1");
  assert.equal(res.status, 200);
  assert.equal(upsertedEmail, "user@example.com");

  const badReq = new NextRequest("http://localhost/api/beta/request-access", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.40" },
    body: JSON.stringify({ email: "not-email" }),
  });
  const badRes = await handleRequestAccess(badReq);
  assert.equal(badRes.status, 400);
});

test("POST /api/beta/feedback validates and stores", async () => {
  let createdMessage = "";
  db.betaFeedback.create = (async (input: { data: { message: string } }) => {
    createdMessage = input.data.message;
    return { id: "fb-1", email: null, pagePath: null, createdAt: new Date() };
  }) as typeof db.betaFeedback.create;

  const req = new NextRequest("http://localhost/api/beta/feedback", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.41" },
    body: JSON.stringify({ message: "Looks great", pagePath: "/beta" }),
  });

  const res = await handleFeedback(req);
  assert.equal(res.status, 200);
  assert.equal(createdMessage, "Looks great");
});

test("PATCH /api/admin/beta/requests/[id] updates status", async () => {
  let updatedStatus = "";

  db.betaAccessRequest.update = (async (input: { data: { status: string } }) => {
    updatedStatus = input.data.status;
    return { id: "11111111-1111-4111-8111-111111111111", email: "user@example.com", userId: null };
  }) as typeof db.betaAccessRequest.update;

  const req = new NextRequest("http://localhost/api/admin/beta/requests/11111111-1111-4111-8111-111111111111", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "APPROVED" }),
  });

  const res = await handleAdminPatchRequestStatus(req, Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }));
  assert.equal(res.status, 200);
  assert.equal(updatedStatus, "APPROVED");
});

test.after(() => {
  db.betaAccessRequest.upsert = originalRequestUpsert;
  db.betaAccessRequest.update = originalRequestUpdate;
  db.betaFeedback.create = originalFeedbackCreate;
  db.$transaction = originalTransaction;
});
