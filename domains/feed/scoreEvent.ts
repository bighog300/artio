export type DecayMode = "exponential" | "linear";

export type FeedScoreWeights = {
  followWeight: number;
  socialWeight: number;
  similarityWeight: number;
  recencyWeight: number;
  distanceWeight: number;
  promotionWeight: number;
  subscriptionWeight: number;
  curatorWeight: number;
  collectionFollowWeight: number;
};

export const DEFAULT_FEED_SCORE_WEIGHTS: FeedScoreWeights = {
  followWeight: 10,
  socialWeight: 7,
  similarityWeight: 5,
  recencyWeight: 4,
  distanceWeight: 6,
  promotionWeight: 5,
  subscriptionWeight: 3,
  curatorWeight: 4,
  collectionFollowWeight: 6,
};

export function interactionDecay(args: {
  occurredAt: Date;
  now?: Date;
  halfLifeHours?: number;
  maxAgeHours?: number;
  mode?: DecayMode;
}) {
  const now = args.now ?? new Date();
  const ageHours = Math.max(0, (now.getTime() - args.occurredAt.getTime()) / (1000 * 60 * 60));
  const mode = args.mode ?? "exponential";

  if (mode === "linear") {
    const maxAge = Math.max(1, args.maxAgeHours ?? 30 * 24);
    return Math.max(0, 1 - ageHours / maxAge);
  }

  const halfLife = Math.max(1, args.halfLifeHours ?? 48);
  return Math.exp((-Math.log(2) * ageHours) / halfLife);
}

export type ScoreEventInput = {
  isFollowed: number;
  interactionsFromFollowedUsers: number;
  similarityToSaved: number;
  freshnessDecay: number;
  proximity: number;
  promotionPriority: number;
  venuePro: number;
  curatorSignal?: number;
  followedCollectionSignal?: number;
};

export function scoreEvent(input: ScoreEventInput, weights: FeedScoreWeights = DEFAULT_FEED_SCORE_WEIGHTS) {
  return (
    weights.followWeight * input.isFollowed +
    weights.socialWeight * input.interactionsFromFollowedUsers +
    weights.similarityWeight * input.similarityToSaved +
    weights.recencyWeight * input.freshnessDecay +
    weights.distanceWeight * input.proximity +
    weights.promotionWeight * input.promotionPriority +
    weights.subscriptionWeight * input.venuePro +
    weights.curatorWeight * (input.curatorSignal ?? 0) +
    weights.collectionFollowWeight * (input.followedCollectionSignal ?? 0)
  );
}
