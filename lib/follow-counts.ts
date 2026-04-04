import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

export function followStatusResponse(args: { followersCount: number; isAuthenticated: boolean; hasFollow: boolean }) {
  return {
    isFollowing: args.isAuthenticated ? args.hasFollow : false,
    followersCount: args.followersCount,
  };
}

export async function getFollowersCount(targetType: "ARTIST" | "VENUE" | "USER", targetId: string) {
  return unstable_cache(
    async () => db.follow.count({ where: { targetType, targetId } }),
    ["follow-count", targetType, targetId],
    {
      revalidate: 30,
      tags: [followCountCacheTag(targetType, targetId)],
    },
  )();
}

export function followCountCacheTag(targetType: "ARTIST" | "VENUE" | "USER", targetId: string): string {
  return `follow-count-${targetType}-${targetId}`;
}
