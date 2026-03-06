import type { Resend } from "resend";

let resend: Resend | null = null;

export function getResendClient(): Resend {
  if (process.env.NODE_ENV === "test") {
    throw new Error("Resend client must not be called in tests. Use a mock.");
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }

  if (!resend) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Resend: ResendClient } = require("resend") as { Resend: new (key: string) => Resend };
    resend = new ResendClient(apiKey);
  }

  return resend;
}
