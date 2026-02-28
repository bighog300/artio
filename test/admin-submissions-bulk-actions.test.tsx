import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/(admin)/admin/_components/SubmissionsModeration.tsx", "utf8");

test("bulk selection UI is present", () => {
  assert.match(source, /const \[selectedIds, setSelectedIds\] = useState<Set<string>>\(new Set\(\)\)/);
  assert.match(source, /function toggleOne\(id: string\)/);
  assert.match(source, /function selectAllOnPage\(idsOnPage: string\[\]\)/);
  assert.match(source, /function clearSelection\(\)/);
  assert.match(source, /\{selectedIds\.size\} selected/);
  assert.match(source, /aria-label="Select all submissions on this page"/);
});

test("bulk approve/reject call existing endpoints and do a single refresh after run", () => {
  assert.match(source, /\/api\/admin\/submissions\/\$\{item\.id\}\/approve/);
  assert.match(source, /\/api\/admin\/submissions\/\$\{item\.id\}\/request-changes/);
  assert.match(source, /\/api\/admin\/submissions\/\$\{item\.id\}\/decision/);
  assert.match(source, /await runBulkWithConcurrency\(/);
  assert.match(source, /router\.refresh\(\)/);
  assert.match(source, /title: action === "approve" \? "Bulk approve completed" : "Bulk reject completed"/);
});

test("bulk reject dialog includes shared reason and confirm", () => {
  assert.match(source, /<Dialog open=\{bulkRejectDialogOpen\} onOpenChange=\{setBulkRejectDialogOpen\}>/);
  assert.match(source, /Reason \(optional\)/);
  assert.match(source, /await runBulk\("reject", bulkRejectReason \|\| null\)/);
});

test("row-level results and no hard reload", () => {
  assert.match(source, /const \[bulkResults, setBulkResults\] = useState<Record<string, BulkResult>>\(\{\}\)/);
  assert.match(source, /❌ Failed:/);
  assert.match(source, /✅ Updated/);
  assert.doesNotMatch(source, /window\.location\.reload\(/);
});


test("bulk approve requires confirmation dialog", () => {
  assert.match(source, /const \[bulkApproveDialogOpen, setBulkApproveDialogOpen\] = useState\(false\)/);
  assert.match(source, /<Dialog open=\{bulkApproveDialogOpen\} onOpenChange=\{setBulkApproveDialogOpen\}>/);
  assert.match(source, /Approve selected submissions\?/);
  assert.match(source, /Confirm approve/);
});
