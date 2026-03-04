import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { handleAttendEvent, handleGetAttendance, handleUnattendEvent } from "../lib/event-attendance-route.ts";

const validEventId = "11111111-1111-4111-8111-111111111111";

test("POST /api/events/[id]/attend succeeds for authenticated user", async () => {
  const attending: Array<{ userId: string; eventId: string }> = [];
  const req = new NextRequest(`http://localhost/api/events/${validEventId}/attend`, { method: "POST" });

  const res = await handleAttendEvent(req, Promise.resolve({ id: validEventId }), {
    requireAuth: async () => ({ id: "user-1", email: "u@example.com", name: null, role: "USER" }),
    getSessionUser: async () => null,
    ensureEventExists: async () => true,
    attendEvent: async (input) => { attending.push(input); },
    unattendEvent: async () => undefined,
    countAttendance: async () => 0,
    isGoing: async () => false,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.isGoing, true);
  assert.deepEqual(attending[0], { userId: "user-1", eventId: validEventId });
});

test("DELETE /api/events/[id]/attend succeeds for authenticated user", async () => {
  const unattended: Array<{ userId: string; eventId: string }> = [];
  const req = new NextRequest(`http://localhost/api/events/${validEventId}/attend`, { method: "DELETE" });

  const res = await handleUnattendEvent(req, Promise.resolve({ id: validEventId }), {
    requireAuth: async () => ({ id: "user-1", email: "u@example.com", name: null, role: "USER" }),
    getSessionUser: async () => null,
    ensureEventExists: async () => true,
    attendEvent: async () => undefined,
    unattendEvent: async (input) => { unattended.push(input); },
    countAttendance: async () => 0,
    isGoing: async () => false,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.isGoing, false);
  assert.deepEqual(unattended[0], { userId: "user-1", eventId: validEventId });
});

test("GET /api/events/[id]/attend returns count and isGoing=false when unauthenticated", async () => {
  const req = new NextRequest(`http://localhost/api/events/${validEventId}/attend`, { method: "GET" });

  const res = await handleGetAttendance(req, Promise.resolve({ id: validEventId }), {
    requireAuth: async () => ({ id: "user-1", email: "u@example.com", name: null, role: "USER" }),
    getSessionUser: async () => null,
    ensureEventExists: async () => true,
    attendEvent: async () => undefined,
    unattendEvent: async () => undefined,
    countAttendance: async () => 12,
    isGoing: async () => true,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.count, 12);
  assert.equal(body.isGoing, false);
});

test("GET /api/events/[id]/attend returns count and isGoing=true when attendee exists", async () => {
  const req = new NextRequest(`http://localhost/api/events/${validEventId}/attend`, { method: "GET" });

  const res = await handleGetAttendance(req, Promise.resolve({ id: validEventId }), {
    requireAuth: async () => ({ id: "user-1", email: "u@example.com", name: null, role: "USER" }),
    getSessionUser: async () => ({ id: "user-1", email: "u@example.com", name: null, role: "USER" }),
    ensureEventExists: async () => true,
    attendEvent: async () => undefined,
    unattendEvent: async () => undefined,
    countAttendance: async () => 12,
    isGoing: async () => true,
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.count, 12);
  assert.equal(body.isGoing, true);
});
