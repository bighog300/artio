import { createHmac, timingSafeEqual } from "node:crypto";

function offerTokenSecret() {
  const secret = process.env.ARTWORK_OFFER_TOKEN_SECRET?.trim();
  if (!secret) {
    throw new Error("ARTWORK_OFFER_TOKEN_SECRET is not set");
  }

  return secret;
}

export function signArtworkOfferToken(offerId: string) {
  return createHmac("sha256", offerTokenSecret()).update(offerId).digest("hex");
}

export function verifyArtworkOfferToken(offerId: string, token: string) {
  const expected = signArtworkOfferToken(offerId);
  const tokenBytes = Buffer.from(token, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (tokenBytes.length !== expectedBytes.length) {
    return false;
  }

  return timingSafeEqual(tokenBytes, expectedBytes);
}
