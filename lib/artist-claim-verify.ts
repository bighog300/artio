import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { enqueueNotification } from "@/lib/notifications";

type VerifyClaimDeps = {
  appDb: Pick<typeof db, "artist" | "user">;
  notify: typeof enqueueNotification;
};

type VerifyClaimSuccess = {
  ok: true;
};

type VerifyClaimFailure = {
  ok: false;
  reason: "invalid_token" | "not_found" | "already_claimed";
};

type VerifyClaimResult = VerifyClaimSuccess | VerifyClaimFailure;

const defaultDeps: VerifyClaimDeps = {
  appDb: db,
  notify: enqueueNotification,
};

function getSecret() {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
      throw new Error("AUTH_SECRET must be set in production");
    }
    return "artist-claim-dev-secret"; // dev/test only
  }
  return secret;
}

function verifyToken(rawToken: string) {
  const [encoded, signature] = rawToken.split(".");
  if (!encoded || !signature) throw new Error("invalid_token");
  const expected = createHmac("sha256", getSecret()).update(encoded).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("invalid_token");

  const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
    slug?: string;
    email?: string;
    claimantName?: string;
    exp?: number;
  };
  if (!parsed.slug || !parsed.email || !parsed.claimantName || !parsed.exp) throw new Error("invalid_token");
  if (Date.now() > parsed.exp) throw new Error("invalid_token");
  return parsed;
}

async function resolveAdminRecipients(appDb: VerifyClaimDeps["appDb"]) {
  const admins = await appDb.user.findMany({ where: { role: "ADMIN" }, select: { email: true } });
  return Array.from(new Set(admins.map((row) => row.email?.trim().toLowerCase()).filter((email): email is string => Boolean(email))));
}

export async function handleArtistClaimVerify(
  slug: string,
  token: string,
  deps: VerifyClaimDeps = defaultDeps,
): Promise<VerifyClaimResult> {
  const payload = verifyToken(token);
  if (payload.slug !== slug) return { ok: false, reason: "invalid_token" };

  const artist = await deps.appDb.artist.findFirst({ where: { slug, isPublished: true, deletedAt: null }, select: { id: true, slug: true, name: true, userId: true } });
  if (!artist) return { ok: false, reason: "not_found" };
  if (artist.userId) return { ok: false, reason: "already_claimed" };

  await deps.appDb.artist.update({
    where: { id: artist.id },
    data: { status: "IN_REVIEW", reviewNotes: `Claim requested by ${payload.claimantName} <${payload.email}>` },
  });

  const adminRecipients = await resolveAdminRecipients(deps.appDb);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
  await Promise.all(
    adminRecipients.map((email) =>
      deps.notify({
        type: "BROADCAST",
        toEmail: email,
        dedupeKey: `artist-claim-admin:${artist.id}:${payload.email}`,
        payload: {
          subject: `Artist claim requires moderation: ${artist.name}`,
          bodyHtml: `<p>${payload.claimantName} (${payload.email}) verified a claim for <a href="${baseUrl}/artists/${artist.slug}">${artist.name}</a>.</p>`,
          unsubscribeUrl: `${baseUrl}/settings/notifications`,
        },
      }),
    ),
  );

  return { ok: true };
}
