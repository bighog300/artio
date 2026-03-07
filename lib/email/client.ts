import type { Resend } from "resend";

const resendClientsByKey = new Map<string, Resend>();

export function getResendClient(apiKey: string): Resend {
  if (process.env.NODE_ENV === "test") {
    throw new Error("Resend client must not be called in tests. Use a mock.");
  }

  const normalizedKey = apiKey.trim();
  const existing = resendClientsByKey.get(normalizedKey);
  if (existing) {
    return existing;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Resend: ResendClient } = require("resend") as { Resend: new (key: string) => Resend };
  const created = new ResendClient(normalizedKey);
  resendClientsByKey.set(normalizedKey, created);
  return created;
}
