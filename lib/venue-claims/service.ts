import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { VenueClaimRequestStatus, VenueClaimStatus, VenueMembershipRole } from "@prisma/client";

export const CLAIM_TOKEN_TTL_MINUTES = 60;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createClaimToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

function plusMinutes(base: Date, minutes: number) {
  return new Date(base.getTime() + minutes * 60_000);
}

export function redactEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const localHead = local.slice(0, 2);
  const domainParts = domain.split(".");
  const domainHead = domainParts[0]?.slice(0, 1) ?? "*";
  const tld = domainParts.slice(1).join(".") || "***";
  return `${localHead}***@${domainHead}***.${tld}`;
}

type VenueRow = { id: string; slug: string; name: string; contactEmail: string | null; claimStatus: VenueClaimStatus };
type ClaimRow = { id: string; venueId: string; userId?: string; status: VenueClaimRequestStatus; expiresAt: Date | null; updatedAt?: Date };

type ClaimsDb = {
  venue: {
    findUnique: (args: unknown) => Promise<VenueRow | null>;
    update: (args: unknown) => Promise<{ id: string; expiresAt?: Date | null }>;
  };
  venueClaimRequest: {
    findUnique?: (args: unknown) => Promise<ClaimRow | null>;
    findFirst: (args: unknown) => Promise<ClaimRow | null>;
    create: (args: unknown) => Promise<ClaimRow>;
    update: (args: unknown) => Promise<{ id: string; expiresAt?: Date | null }>;
  };
  venueMembership: {
    upsert: (args: unknown) => Promise<{ id: string }>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
  };
  venueClaimInvite?: {
    findUnique: (args: unknown) => Promise<{ id: string; token: string; venueId: string; email: string; personalMessage?: string | null; expiresAt: Date; claimedAt: Date | null; claimId: string | null; venue?: { id: string; name: string; slug: string } } | null>;
    update: (args: unknown) => Promise<{ id: string }>;
  };
  $transaction: <T>(fn: (tx: ClaimsDb) => Promise<T>) => Promise<T>;
};

type NotifyFn = (args: { toEmail: string; token: string; slug: string; venueName: string; expiresAt: Date }) => Promise<void>;

export async function createVenueClaim(args: {
  db: ClaimsDb;
  slug: string;
  userId: string;
  roleAtVenue: string;
  message?: string | null;
  notify: NotifyFn;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  const venue = await args.db.venue.findUnique({ where: { slug: args.slug }, select: { id: true, slug: true, name: true, contactEmail: true, claimStatus: true } });
  if (!venue) throw new Error("not_found");

  const recent = await args.db.venueClaimRequest.findFirst({
    where: {
      venueId: venue.id,
      userId: args.userId,
      status: VenueClaimRequestStatus.PENDING_VERIFICATION,
      createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
    },
    select: { id: true, venueId: true, status: true, expiresAt: true },
  });
  if (recent) throw new Error("rate_limited");

  const activeForVenue = await args.db.venueClaimRequest.findFirst({
    where: { venueId: venue.id, status: VenueClaimRequestStatus.PENDING_VERIFICATION },
    select: { id: true, venueId: true, status: true, expiresAt: true },
  });
  if (activeForVenue) {
    const isExpired = activeForVenue.expiresAt !== null && activeForVenue.expiresAt < now;
    if (isExpired) {
      await args.db.$transaction(async (tx) => {
        await tx.venueClaimRequest.update({
          where: { id: activeForVenue.id },
          data: { status: VenueClaimRequestStatus.EXPIRED },
        });
        await tx.venue.update({ where: { id: venue.id }, data: { claimStatus: VenueClaimStatus.UNCLAIMED } });
      });
    } else {
      throw new Error("claim_pending");
    }
  }

  if (!venue.contactEmail) {
    const claim = await args.db.venueClaimRequest.create({
      data: {
        venueId: venue.id,
        userId: args.userId,
        roleAtVenue: args.roleAtVenue,
        message: args.message ?? null,
        status: VenueClaimRequestStatus.PENDING_VERIFICATION,
        tokenHash: null,
        expiresAt: null,
      },
    });
    await args.db.venue.update({ where: { id: venue.id }, data: { claimStatus: VenueClaimStatus.PENDING } });
    return { claimId: claim.id, status: claim.status, expiresAt: null, delivery: "MANUAL_REVIEW" as const };
  }

  const { token, tokenHash } = createClaimToken();
  const expiresAt = plusMinutes(now, CLAIM_TOKEN_TTL_MINUTES);

  const claim = await args.db.venueClaimRequest.create({
    data: {
      venueId: venue.id,
      userId: args.userId,
      roleAtVenue: args.roleAtVenue,
      message: args.message ?? null,
      tokenHash,
      expiresAt,
      status: VenueClaimRequestStatus.PENDING_VERIFICATION,
    },
  });

  await args.db.venue.update({ where: { id: venue.id }, data: { claimStatus: VenueClaimStatus.PENDING } });
  await args.notify({ toEmail: venue.contactEmail, token, slug: venue.slug, venueName: venue.name, expiresAt });

  return { claimId: claim.id, status: claim.status, expiresAt, delivery: "EMAIL" as const };
}

export async function verifyVenueClaim(args: { db: ClaimsDb; slug: string; token: string; now?: Date }) {
  const now = args.now ?? new Date();
  const tokenHash = hashToken(args.token);
  const venue = await args.db.venue.findUnique({ where: { slug: args.slug }, select: { id: true, slug: true, name: true, contactEmail: true, claimStatus: true } });
  if (!venue) throw new Error("not_found");

  const claim = await args.db.venueClaimRequest.findFirst({
    where: {
      venueId: venue.id,
      tokenHash,
      status: VenueClaimRequestStatus.PENDING_VERIFICATION,
      expiresAt: { gt: now },
    },
    select: { id: true, venueId: true, userId: true, status: true, expiresAt: true },
  });
  if (!claim?.venueId) throw new Error("invalid_token");

  const approved = await approveClaim(args.db, claim.id, now);
  if (!approved) throw new Error("invalid_token");

  await args.db.venueClaimRequest.update({
    where: { id: claim.id },
    data: { tokenHash: null },
  });

  return { venueId: approved.venueId, redirectTo: `/my/venues/${approved.venueId}`, status: VenueClaimRequestStatus.VERIFIED };
}

export async function resendClaimToken(args: { db: ClaimsDb; slug: string; userId: string; now?: Date }) {
  const now = args.now ?? new Date();
  const venue = await args.db.venue.findUnique({ where: { slug: args.slug }, select: { id: true, contactEmail: true } });
  if (!venue?.contactEmail) return { error: "not_found" as const };

  const claim = await args.db.venueClaimRequest.findFirst({
    where: {
      venueId: venue.id,
      userId: args.userId,
      status: VenueClaimRequestStatus.PENDING_VERIFICATION,
    },
    orderBy: [{ updatedAt: "desc" }],
    select: { id: true, venueId: true, userId: true, status: true, expiresAt: true, updatedAt: true },
  });

  if (!claim) return { error: "not_found" as const };
  if (claim.updatedAt && now.getTime() - claim.updatedAt.getTime() < 5 * 60_000) return { error: "cooldown" as const };

  const { token, tokenHash } = createClaimToken();
  const expiresAt = plusMinutes(now, CLAIM_TOKEN_TTL_MINUTES);
  const updated = await args.db.venueClaimRequest.update({
    where: { id: claim.id },
    data: { tokenHash, expiresAt },
    select: { id: true, expiresAt: true },
  });

  return { claimId: updated.id, expiresAt: updated.expiresAt ?? expiresAt, token, toEmail: venue.contactEmail };
}



export async function revokeClaim(db: ClaimsDb, claimId: string, now: Date) {
  void now;
  return db.$transaction(async (tx) => {
    const lookup = tx.venueClaimRequest.findUnique ?? tx.venueClaimRequest.findFirst;
    const claim = await lookup({
      where: { id: claimId },
      select: { id: true, venueId: true, userId: true, status: true, expiresAt: true },
    });

    if (!claim?.userId) return null;

    await tx.venueMembership.deleteMany({
      where: { userId: claim.userId, venueId: claim.venueId },
    });

    await tx.venue.update({ where: { id: claim.venueId }, data: { claimStatus: VenueClaimStatus.UNCLAIMED } });
    await tx.venueClaimRequest.update({
      where: { id: claim.id },
      data: {
        status: VenueClaimRequestStatus.REJECTED,
        verifiedAt: null,
        rejectionReason: "Revoked by admin",
        tokenHash: null,
      },
    });

    return claim;
  });
}

export async function rejectClaim(db: ClaimsDb, claimId: string, rejectionReason: string | null, now: Date) {
  void now;
  return db.$transaction(async (tx) => {
    const lookup = tx.venueClaimRequest.findUnique ?? tx.venueClaimRequest.findFirst;
    const claim = await lookup({
      where: { id: claimId },
      select: { id: true, venueId: true, userId: true, status: true, expiresAt: true },
    });

    if (!claim) return null;

    await tx.venueClaimRequest.update({
      where: { id: claim.id },
      data: { status: VenueClaimRequestStatus.REJECTED, rejectionReason },
    });
    await tx.venue.update({ where: { id: claim.venueId }, data: { claimStatus: VenueClaimStatus.UNCLAIMED } });

    return claim;
  });
}

export async function approveClaim(db: ClaimsDb, claimId: string, now: Date) {
  return db.$transaction(async (tx) => {
    const lookup = tx.venueClaimRequest.findUnique ?? tx.venueClaimRequest.findFirst;
    const claim = await lookup({
      where: { id: claimId },
      select: { id: true, venueId: true, userId: true, status: true, expiresAt: true },
    });

    if (!claim?.userId) return null;

    await tx.venueMembership.upsert({
      where: { userId_venueId: { userId: claim.userId, venueId: claim.venueId } },
      update: { role: VenueMembershipRole.OWNER },
      create: { userId: claim.userId, venueId: claim.venueId, role: VenueMembershipRole.OWNER },
    });

    await tx.venue.update({ where: { id: claim.venueId }, data: { claimStatus: VenueClaimStatus.CLAIMED } });
    await tx.venueClaimRequest.update({
      where: { id: claim.id },
      data: { status: VenueClaimRequestStatus.VERIFIED, verifiedAt: now },
    });

    return claim;
  });
}

function safeTokenMatch(expected: string, provided: string) {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function getVenueClaimInviteByToken(args: { db: ClaimsDb; token: string; now?: Date }) {
  const now = args.now ?? new Date();
  const invite = await args.db.venueClaimInvite?.findUnique({
    where: { token: args.token },
    select: {
      id: true,
      token: true,
      venueId: true,
      email: true,
      personalMessage: true,
      expiresAt: true,
      claimedAt: true,
      claimId: true,
      venue: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!invite || !safeTokenMatch(invite.token, args.token)) return { state: "invalid" as const };
  if (invite.expiresAt <= now) return { state: "expired" as const };
  if (invite.claimedAt || invite.claimId) return { state: "claimed" as const };
  return { state: "valid" as const, invite };
}

export async function submitVenueClaimFromInvite(args: { db: ClaimsDb; token: string; userId: string; now?: Date }) {
  const now = args.now ?? new Date();
  return args.db.$transaction(async (tx) => {
    const lookup = await getVenueClaimInviteByToken({ db: tx, token: args.token, now });
    if (lookup.state !== "valid") throw new Error(lookup.state);

    const claim = await tx.venueClaimRequest.create({
      data: {
        venueId: lookup.invite.venueId,
        userId: args.userId,
        roleAtVenue: "Owner",
        message: lookup.invite.personalMessage ?? null,
        tokenHash: null,
        expiresAt: null,
        status: VenueClaimRequestStatus.PENDING_VERIFICATION,
      },
      select: { id: true, venueId: true, status: true, expiresAt: true },
    });

    await tx.venue.update({ where: { id: lookup.invite.venueId }, data: { claimStatus: VenueClaimStatus.PENDING } });
    await tx.venueClaimInvite?.update({
      where: { id: lookup.invite.id },
      data: { claimedAt: now, claimId: claim.id },
    });

    return { claimId: claim.id, venueId: claim.venueId };
  });
}
