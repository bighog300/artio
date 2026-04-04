import type { FollowTargetType } from "@prisma/client";

export type FollowCreateInput = {
  userId: string;
  targetType: FollowTargetType;
  targetId: string;
};

export type FollowDeleteInput = FollowCreateInput;

export async function upsertFollowWithDeps(
  deps: {
    findTarget: (targetType: FollowTargetType, targetId: string) => Promise<boolean>;
    upsert: (input: FollowCreateInput) => Promise<void>;
  },
  input: FollowCreateInput,
) {
  const exists = await deps.findTarget(input.targetType, input.targetId);
  if (!exists) return { ok: false as const, code: "not_found" as const };

  await deps.upsert(input);
  return { ok: true as const };
}

export async function deleteFollowWithDeps(
  deps: { deleteMany: (input: FollowDeleteInput) => Promise<void> },
  input: FollowDeleteInput,
) {
  await deps.deleteMany(input);
  return { ok: true as const };
}

export function splitFollowIds(follows: Array<{ targetType: FollowTargetType; targetId: string }>) {
  const artists: string[] = [];
  const venues: string[] = [];
  const users: string[] = [];

  for (const follow of follows) {
    if (follow.targetType === "ARTIST") artists.push(follow.targetId);
    if (follow.targetType === "VENUE") venues.push(follow.targetId);
    if (follow.targetType === "USER") users.push(follow.targetId);
  }

  return {
    artists,
    venues,
    users,
    counts: { artists: artists.length, venues: venues.length, users: users.length, total: artists.length + venues.length + users.length },
  };
}
