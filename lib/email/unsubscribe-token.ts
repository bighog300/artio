import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  if (!process.env.UNSUBSCRIBE_TOKEN_SECRET) {
    throw new Error("UNSUBSCRIBE_TOKEN_SECRET is not set");
  }

  return process.env.UNSUBSCRIBE_TOKEN_SECRET;
}

export function generateUnsubscribeToken(email: string): string {
  return createHmac("sha256", secret()).update(email.toLowerCase()).digest("hex");
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = generateUnsubscribeToken(email);
  const tokenBytes = Buffer.from(token, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");

  if (tokenBytes.length !== expectedBytes.length) {
    return false;
  }

  return timingSafeEqual(tokenBytes, expectedBytes);
}
