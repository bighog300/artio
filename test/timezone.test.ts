import test from "node:test";
import assert from "node:assert/strict";
import { inferTimezoneFromLatLng } from "../lib/timezone";

test("inferTimezoneFromLatLng infers London", () => {
  assert.equal(inferTimezoneFromLatLng(51.5074, -0.1278), "Europe/London");
});

test("inferTimezoneFromLatLng infers New York", () => {
  assert.equal(inferTimezoneFromLatLng(40.7128, -74.006), "America/New_York");
});

test("inferTimezoneFromLatLng infers Sydney", () => {
  assert.equal(inferTimezoneFromLatLng(-33.8688, 151.2093), "Australia/Sydney");
});
