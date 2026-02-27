import test from "node:test";
import assert from "node:assert/strict";
import { assertSafeUrl } from "@/lib/ingest/url-guard";
import { IngestError } from "@/lib/ingest/errors";

test("rejects localhost and private hosts", async () => {
  const unsafeInputs = [
    "http://localhost/test",
    "http://127.0.0.1/test",
    "http://10.10.10.10/test",
    "http://192.168.1.2/test",
    "http://169.254.10.2/test",
    "http://[::1]/test",
    "http://[fc00::1]/test",
  ];

  for (const input of unsafeInputs) {
    await assert.rejects(() =>
      assertSafeUrl(input, {
        lookupAll: async () => [{ address: "93.184.216.34", family: 4 }],
      }),
    );
  }
});

test("accepts public URL when DNS resolution is public", async () => {
  const safe = await assertSafeUrl("https://example.com/path", {
    lookupAll: async () => [{ address: "93.184.216.34", family: 4 }],
  });

  assert.equal(safe.hostname, "example.com");
  assert.equal(safe.protocol, "https:");
});

test("rejects when DNS resolves to private IP", async () => {
  await assert.rejects(
    () =>
      assertSafeUrl("https://example.com", {
        lookupAll: async () => [{ address: "10.0.0.2", family: 4 }],
      }),
    (error: unknown) => {
      assert.ok(error instanceof IngestError);
      return error.code === "DNS_PRIVATE_IP";
    },
  );
});
