export type PreferenceEntityType = "event" | "artist" | "venue";

export const PERSONALIZATION_KEYS = {
  hiddenItems: "ap_hidden_items",
  downrankTags: "ap_downrank_tags",
  downrankVenues: "ap_downrank_venues",
  downrankArtists: "ap_downrank_artists",
  feedbackEvents: "ap_feedback_events",
} as const;

const FEEDBACK_LIMIT = 50;

type PreferenceItem = { type: PreferenceEntityType; idOrSlug: string };
export type PreferenceFeedbackEvent = PreferenceItem & { action: "hide" | "show_less" | "click" | "save" | "attend" | "follow"; at: string };

type FilterableItem = {
  id?: string;
  slug?: string;
  tags?: string[];
  venueSlug?: string | null;
  artistSlugs?: string[];
  type?: PreferenceEntityType;
};

function storage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function readArray(key: string): string[] {
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeArray(key: string, values: string[]) {
  try {
    storage()?.setItem(key, JSON.stringify(Array.from(new Set(values)).slice(0, FEEDBACK_LIMIT)));
  } catch {
    // ignore write errors
  }
}

export function readFeedbackEvents(): PreferenceFeedbackEvent[] {
  try {
    const raw = storage()?.getItem(PERSONALIZATION_KEYS.feedbackEvents);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is PreferenceFeedbackEvent => Boolean(item && typeof item === "object")) : [];
  } catch {
    return [];
  }
}

export function writeFeedbackEvents(events: PreferenceFeedbackEvent[]) {
  try {
    storage()?.setItem(PERSONALIZATION_KEYS.feedbackEvents, JSON.stringify(events.slice(0, FEEDBACK_LIMIT)));
  } catch {
    // ignore write errors
  }
}

export function itemKey({ type, idOrSlug }: PreferenceItem) {
  return `${type}:${idOrSlug.trim().toLowerCase()}`;
}

export function addFeedback(action: PreferenceFeedbackEvent["action"], item: PreferenceItem) {
  const next: PreferenceFeedbackEvent = { ...item, action, at: new Date().toISOString() };
  writeFeedbackEvents([next, ...readFeedbackEvents()]);
}

export function prependUniqueValue(key: "hiddenItems" | "downrankTags" | "downrankVenues" | "downrankArtists", value: string) {
  const map = {
    hiddenItems: PERSONALIZATION_KEYS.hiddenItems,
    downrankTags: PERSONALIZATION_KEYS.downrankTags,
    downrankVenues: PERSONALIZATION_KEYS.downrankVenues,
    downrankArtists: PERSONALIZATION_KEYS.downrankArtists,
  } as const;
  writeArray(map[key], [value, ...readArray(map[key])]);
}

export function prependUniqueValues(key: "downrankTags" | "downrankVenues" | "downrankArtists", values: string[]) {
  const map = {
    downrankTags: PERSONALIZATION_KEYS.downrankTags,
    downrankVenues: PERSONALIZATION_KEYS.downrankVenues,
    downrankArtists: PERSONALIZATION_KEYS.downrankArtists,
  } as const;
  writeArray(map[key], [...values, ...readArray(map[key])]);
}

export function hideItem(item: PreferenceItem) {
  prependUniqueValue("hiddenItems", itemKey(item));
  addFeedback("hide", item);
}

export function showLessLikeThis(item: PreferenceItem & { tags?: string[] }) {
  if (item.type === "artist") {
    prependUniqueValue("downrankArtists", item.idOrSlug);
  }
  if (item.type === "venue") {
    prependUniqueValue("downrankVenues", item.idOrSlug);
  }
  if (item.tags?.length) {
    prependUniqueValues("downrankTags", item.tags);
  }
  hideItem(item);
  addFeedback("show_less", item);
}

export function isHidden(item: PreferenceItem) {
  return readArray(PERSONALIZATION_KEYS.hiddenItems).includes(itemKey(item));
}

export function filterHidden<T extends FilterableItem>(items: T[], type: PreferenceEntityType): T[] {
  return items.filter((item) => {
    const idOrSlug = item.slug ?? item.id;
    if (!idOrSlug) return true;
    return !isHidden({ type, idOrSlug });
  });
}

export function getPreferenceSnapshot() {
  return {
    hiddenItems: readArray(PERSONALIZATION_KEYS.hiddenItems),
    downrankTags: readArray(PERSONALIZATION_KEYS.downrankTags),
    downrankVenues: readArray(PERSONALIZATION_KEYS.downrankVenues),
    downrankArtists: readArray(PERSONALIZATION_KEYS.downrankArtists),
    feedbackEvents: readFeedbackEvents(),
  };
}

export function clearHiddenItems() {
  try {
    storage()?.removeItem(PERSONALIZATION_KEYS.hiddenItems);
  } catch {}
}

export function resetPersonalization() {
  const store = storage();
  if (!store) return;
  Object.values(PERSONALIZATION_KEYS).forEach((key) => {
    try { store.removeItem(key); } catch {}
  });
}

export function removeDownrankValue(key: "downrankTags" | "downrankVenues" | "downrankArtists", value: string) {
  const map = {
    downrankTags: PERSONALIZATION_KEYS.downrankTags,
    downrankVenues: PERSONALIZATION_KEYS.downrankVenues,
    downrankArtists: PERSONALIZATION_KEYS.downrankArtists,
  } as const;
  writeArray(map[key], readArray(map[key]).filter((item) => item !== value));
}

export function applyDownrankSort<T extends FilterableItem>(items: T[]): T[] {
  const { downrankArtists, downrankTags, downrankVenues } = getPreferenceSnapshot();
  const downrankArtistSet = new Set(downrankArtists.map((item) => item.toLowerCase()));
  const downrankTagSet = new Set(downrankTags.map((item) => item.toLowerCase()));
  const downrankVenueSet = new Set(downrankVenues.map((item) => item.toLowerCase()));

  return [...items].sort((a, b) => scorePenalty(a, downrankArtistSet, downrankVenueSet, downrankTagSet) - scorePenalty(b, downrankArtistSet, downrankVenueSet, downrankTagSet));
}

function scorePenalty(item: FilterableItem, artists: Set<string>, venues: Set<string>, tags: Set<string>) {
  let penalty = 0;
  if (item.venueSlug && venues.has(item.venueSlug.toLowerCase())) penalty += 3;
  if (item.artistSlugs?.some((slug) => artists.has(slug.toLowerCase()))) penalty += 3;
  if (item.tags?.some((tag) => tags.has(tag.toLowerCase()))) penalty += 2;
  return penalty;
}
