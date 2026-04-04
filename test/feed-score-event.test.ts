import test from "node:test";
import assert from "node:assert/strict";
import { interactionDecay, scoreEvent } from "@/domains/feed/scoreEvent";

test("scoreEvent applies weighted formula", () => {
  const score = scoreEvent({
    isFollowed: 1,
    interactionsFromFollowedUsers: 2,
    similarityToSaved: 0.5,
    freshnessDecay: 1,
    proximity: 0.8,
    promotionPriority: 0.5,
    venuePro: 1,
    curatorSignal: 1,
    followedCollectionSignal: 1,
  });

  assert.ok(score > 0);
  assert.equal(Number(score.toFixed(1)), 50.8);
});

test("interactionDecay exponential decays over time", () => {
  const now = new Date("2026-04-04T00:00:00.000Z");
  const recent = interactionDecay({ occurredAt: new Date("2026-04-03T12:00:00.000Z"), now, halfLifeHours: 24 });
  const old = interactionDecay({ occurredAt: new Date("2026-03-20T00:00:00.000Z"), now, halfLifeHours: 24 });
  assert.ok(recent > old);
  assert.ok(old > 0);
});

test("interactionDecay linear hits zero after max age", () => {
  const now = new Date("2026-04-04T00:00:00.000Z");
  const expired = interactionDecay({ occurredAt: new Date("2026-03-01T00:00:00.000Z"), now, mode: "linear", maxAgeHours: 24 * 7 });
  assert.equal(expired, 0);
});
