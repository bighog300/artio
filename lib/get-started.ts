export type GetStartedSignals = {
  hasFollowed: boolean;
  hasLocation: boolean;
  hasSavedSearch: boolean;
  hasVisitedFollowing?: boolean;
};

export type GetStartedStep = {
  key: "follow" | "hasSetLocation" | "savedSearch" | "browseNearby" | "visitFollowing";
  title: string;
  description: string;
  done: boolean;
  ctas: Array<{ label: string; href: string }>;
};

export type GetStartedProgress = {
  steps: GetStartedStep[];
  completedCount: number;
  totalCount: number;
  completedAll: boolean;
  currentStepNumber: number;
};

export function computeGetStartedProgress(signals: GetStartedSignals): GetStartedProgress {
  const steps: GetStartedStep[] = [
    {
      key: "follow",
      title: "Follow an artist or venue",
      description: "Follow artists or venues to personalize your feed.",
      done: signals.hasFollowed,
      ctas: [
        { label: "Browse venues", href: "/venues" },
        { label: "Browse artists", href: "/artists" },
      ],
    },
    {
      key: "hasSetLocation",
      title: "Set your location",
      description: "Add your location to unlock better nearby recommendations.",
      done: signals.hasLocation,
      ctas: [
        { label: "Update location", href: "/account#location" },
      ],
    },
    {
      key: "savedSearch",
      title: "Save your first search",
      description: "Create a saved search from Search or Nearby to get alerts.",
      done: signals.hasSavedSearch,
      ctas: [
        { label: "Search events", href: "/search" },
        { label: "Saved searches", href: "/saved-searches" },
      ],
    },
    {
      key: "browseNearby",
      title: "Browse events near you",
      description: "See local events and recommendations based on your location.",
      done: signals.hasLocation,
      ctas: [
        { label: "Open nearby", href: "/nearby" },
      ],
    },
    {
      key: "visitFollowing",
      title: "Visit your Following feed",
      description: "Catch up on updates and events from artists and venues you follow.",
      done: Boolean(signals.hasVisitedFollowing ?? signals.hasFollowed),
      ctas: [
        { label: "Go to Following", href: "/following" },
      ],
    },
  ];

  const completedCount = steps.filter((step) => step.done).length;
  const totalCount = steps.length;
  const completedAll = completedCount === totalCount;
  const firstIncomplete = steps.findIndex((step) => !step.done);

  return {
    steps,
    completedCount,
    totalCount,
    completedAll,
    currentStepNumber: completedAll ? totalCount : firstIncomplete + 1,
  };
}
