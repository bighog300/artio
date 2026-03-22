import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("admin ingest list page is review-only; trigger lives on runs page", () => {
  const pageSource = readFileSync("app/(admin)/admin/ingest/page.tsx", "utf8");
  // List page is review-only — no trigger widget
  assert.match(pageSource, /title="Ingest"/);
  assert.doesNotMatch(pageSource, /IngestTriggerClient/);
  assert.match(pageSource, /Use the Runs tab to trigger/);

  // Trigger now lives on the runs page
  const runsPageSource = readFileSync(
    "app/(admin)/admin/ingest/runs/page.tsx",
    "utf8",
  );
  assert.match(runsPageSource, /IngestTriggerClient/);
  assert.match(runsPageSource, /Trigger a manual extraction run/);
});

test("admin ingest run detail includes candidate moderation actions", () => {
  const detailSource = readFileSync("app\/(admin)\/admin\/ingest\/runs\/\[runId\]\/page.tsx", "utf8");
  const actionsSource = readFileSync("app/(admin)/admin/ingest/_components/ingest-candidate-actions.tsx", "utf8");
  assert.match(detailSource, /Extracted Candidates/);
  assert.match(detailSource, /Primaries/);
  assert.match(actionsSource, /Approve/);
  assert.match(actionsSource, /Reject/);
  assert.match(actionsSource, /router\.refresh\(\)/);
  assert.match(actionsSource, /field === "startAt"\) return "start date"/);
  assert.match(actionsSource, /field === "timezone"\) return "timezone"/);
  assert.match(actionsSource, /field === "endAt"\) return "end time"/);
  const candidatesSource = readFileSync("app/(admin)/admin/ingest/_components/ingest-run-candidates.tsx", "utf8");
  assert.match(candidatesSource, /Show duplicates/);
  assert.match(candidatesSource, /Triage:/);
  assert.match(candidatesSource, /Needs review/);
  assert.match(candidatesSource, /No actions/);
});

test("admin sidebar includes ingest route", () => {
  const navSource = readFileSync(
    "app/(admin)/admin/_components/admin-nav-sections.ts",
    "utf8"
  );
  assert.match(navSource, /href: "\/admin\/ingest", label: "Ingest"/);
});
