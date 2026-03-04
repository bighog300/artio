import { DEFAULT_CAPS, DEFAULT_DECAY, DEFAULT_WEIGHTS } from "@/lib/personalization/tuning";
export const TASTE_STORAGE_KEY = "ap_taste_v3";
const MODEL_VERSION = 1;
const WEIGHT_MIN = DEFAULT_WEIGHTS.tasteWeightMin;
const WEIGHT_MAX = DEFAULT_WEIGHTS.tasteWeightMax;
const DECAY_FACTOR = DEFAULT_DECAY;
const MAX_TAGS = DEFAULT_CAPS;
const MAX_VENUES = DEFAULT_CAPS;
const MAX_ARTISTS = DEFAULT_CAPS;

export type TasteModel = {
  version: number;
  updatedAt: string;
  tagWeights: Record<string, number>;
  venueWeights: Record<string, number>;
  artistWeights: Record<string, number>;
  daypartWeights: { morning: number; afternoon: number; evening: number; night: number };
  dowWeights: { mon: number; tue: number; wed: number; thu: number; fri: number; sat: number; sun: number };
};

export type TasteFeedbackType = "click" | "save" | "attend" | "follow" | "show_less" | "hide";

export type TasteFeedbackEvent = {
  type: TasteFeedbackType;
  tags?: string[];
  venueSlug?: string | null;
  artistSlugs?: string[];
  followedType?: "artist" | "venue";
  followedSlug?: string;
  at?: Date;
};

const defaultDaypartWeights = { morning: 0, afternoon: 0, evening: 0, night: 0 };
const defaultDowWeights = { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 };

const inMemoryStore = new Map<string, string>();

function clampWeight(value: number) {
  return Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, Number.isFinite(value) ? value : 0));
}

function normalize(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function createDefaultModel(now = new Date()): TasteModel {
  return {
    version: MODEL_VERSION,
    updatedAt: now.toISOString(),
    tagWeights: {},
    venueWeights: {},
    artistWeights: {},
    daypartWeights: { ...defaultDaypartWeights },
    dowWeights: { ...defaultDowWeights },
  };
}

function storageLike() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    return null;
  }
  return {
    getItem: (key: string) => inMemoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      inMemoryStore.set(key, value);
    },
  };
}

function sanitizeWeights(weights: Record<string, number>, maxSize: number) {
  const entries = Object.entries(weights)
    .map(([key, value]) => [normalize(key), clampWeight(value)] as const)
    .filter(([key, value]) => key && value !== 0);

  if (entries.length <= maxSize) return Object.fromEntries(entries);

  const keep = entries
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, maxSize);

  return Object.fromEntries(keep);
}

function withDecay(weights: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(weights)
      .map(([key, value]) => [normalize(key), clampWeight(value * DECAY_FACTOR)] as const)
      .filter(([, value]) => Math.abs(value) >= 0.001),
  );
}

function safeParse(raw: string | null): TasteModel {
  if (!raw) return createDefaultModel();
  try {
    const parsed = JSON.parse(raw) as Partial<TasteModel>;
    return {
      version: MODEL_VERSION,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      tagWeights: sanitizeWeights(parsed.tagWeights ?? {}, MAX_TAGS),
      venueWeights: sanitizeWeights(parsed.venueWeights ?? {}, MAX_VENUES),
      artistWeights: sanitizeWeights(parsed.artistWeights ?? {}, MAX_ARTISTS),
      daypartWeights: {
        morning: clampWeight(parsed.daypartWeights?.morning ?? 0),
        afternoon: clampWeight(parsed.daypartWeights?.afternoon ?? 0),
        evening: clampWeight(parsed.daypartWeights?.evening ?? 0),
        night: clampWeight(parsed.daypartWeights?.night ?? 0),
      },
      dowWeights: {
        mon: clampWeight(parsed.dowWeights?.mon ?? 0),
        tue: clampWeight(parsed.dowWeights?.tue ?? 0),
        wed: clampWeight(parsed.dowWeights?.wed ?? 0),
        thu: clampWeight(parsed.dowWeights?.thu ?? 0),
        fri: clampWeight(parsed.dowWeights?.fri ?? 0),
        sat: clampWeight(parsed.dowWeights?.sat ?? 0),
        sun: clampWeight(parsed.dowWeights?.sun ?? 0),
      },
    };
  } catch {
    return createDefaultModel();
  }
}

export function decayTasteModel(model: TasteModel, now = new Date()): TasteModel {
  return {
    ...model,
    updatedAt: now.toISOString(),
    tagWeights: sanitizeWeights(withDecay(model.tagWeights), MAX_TAGS),
    venueWeights: sanitizeWeights(withDecay(model.venueWeights), MAX_VENUES),
    artistWeights: sanitizeWeights(withDecay(model.artistWeights), MAX_ARTISTS),
    daypartWeights: {
      morning: clampWeight(model.daypartWeights.morning * DECAY_FACTOR),
      afternoon: clampWeight(model.daypartWeights.afternoon * DECAY_FACTOR),
      evening: clampWeight(model.daypartWeights.evening * DECAY_FACTOR),
      night: clampWeight(model.daypartWeights.night * DECAY_FACTOR),
    },
    dowWeights: {
      mon: clampWeight(model.dowWeights.mon * DECAY_FACTOR),
      tue: clampWeight(model.dowWeights.tue * DECAY_FACTOR),
      wed: clampWeight(model.dowWeights.wed * DECAY_FACTOR),
      thu: clampWeight(model.dowWeights.thu * DECAY_FACTOR),
      fri: clampWeight(model.dowWeights.fri * DECAY_FACTOR),
      sat: clampWeight(model.dowWeights.sat * DECAY_FACTOR),
      sun: clampWeight(model.dowWeights.sun * DECAY_FACTOR),
    },
  };
}

export function loadTasteModel(): TasteModel {
  const store = storageLike();
  if (!store) return createDefaultModel();
  const model = safeParse(store.getItem(TASTE_STORAGE_KEY));
  const decayed = decayTasteModel(model, new Date());
  saveTasteModel(decayed);
  return decayed;
}

export function saveTasteModel(model: TasteModel) {
  const store = storageLike();
  if (!store) return;
  const next: TasteModel = {
    ...model,
    version: MODEL_VERSION,
    updatedAt: model.updatedAt || new Date().toISOString(),
    tagWeights: sanitizeWeights(model.tagWeights, MAX_TAGS),
    venueWeights: sanitizeWeights(model.venueWeights, MAX_VENUES),
    artistWeights: sanitizeWeights(model.artistWeights, MAX_ARTISTS),
  };

  try {
    store.setItem(TASTE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore unavailable storage
  }
}

function addWeight(target: Record<string, number>, values: string[] | undefined, delta: number) {
  (values ?? []).forEach((value) => {
    const key = normalize(value);
    if (!key) return;
    target[key] = clampWeight((target[key] ?? 0) + delta);
  });
}

function getDaypart(date: Date): keyof TasteModel["daypartWeights"] {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}

function getDowKey(date: Date): keyof TasteModel["dowWeights"] {
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][date.getDay()] as keyof TasteModel["dowWeights"];
}

export function applyTasteUpdate(model: TasteModel, feedbackEvent: TasteFeedbackEvent): TasteModel {
  const deltaByType: Record<TasteFeedbackType, number> = {
    click: DEFAULT_WEIGHTS.tasteDeltaClick,
    save: DEFAULT_WEIGHTS.tasteDeltaSave,
    attend: DEFAULT_WEIGHTS.tasteDeltaAttend,
    follow: DEFAULT_WEIGHTS.tasteDeltaFollow,
    show_less: DEFAULT_WEIGHTS.tasteDeltaShowLess,
    hide: DEFAULT_WEIGHTS.tasteDeltaHide,
  };

  const timeDeltaByType: Partial<Record<TasteFeedbackType, number>> = {
    click: DEFAULT_WEIGHTS.tasteTimeDeltaClick,
    save: DEFAULT_WEIGHTS.tasteTimeDeltaSave,
    attend: DEFAULT_WEIGHTS.tasteTimeDeltaAttend,
    show_less: DEFAULT_WEIGHTS.tasteTimeDeltaShowLess,
    hide: DEFAULT_WEIGHTS.tasteTimeDeltaHide,
  };

  const delta = deltaByType[feedbackEvent.type] ?? 0;
  const next: TasteModel = {
    ...model,
    updatedAt: (feedbackEvent.at ?? new Date()).toISOString(),
    tagWeights: { ...model.tagWeights },
    venueWeights: { ...model.venueWeights },
    artistWeights: { ...model.artistWeights },
    daypartWeights: { ...model.daypartWeights },
    dowWeights: { ...model.dowWeights },
  };

  addWeight(next.tagWeights, feedbackEvent.tags, delta);
  addWeight(next.venueWeights, feedbackEvent.venueSlug ? [feedbackEvent.venueSlug] : undefined, delta);
  addWeight(next.artistWeights, feedbackEvent.artistSlugs, delta);

  if (feedbackEvent.type === "follow" && feedbackEvent.followedSlug) {
    if (feedbackEvent.followedType === "artist") addWeight(next.artistWeights, [feedbackEvent.followedSlug], delta);
    if (feedbackEvent.followedType === "venue") addWeight(next.venueWeights, [feedbackEvent.followedSlug], delta);
  }

  const now = feedbackEvent.at ?? new Date();
  const timeDelta = timeDeltaByType[feedbackEvent.type] ?? 0;
  if (timeDelta !== 0) {
    const daypart = getDaypart(now);
    const dow = getDowKey(now);
    next.daypartWeights[daypart] = clampWeight(next.daypartWeights[daypart] + timeDelta);
    next.dowWeights[dow] = clampWeight(next.dowWeights[dow] + timeDelta);
  }

  next.tagWeights = sanitizeWeights(next.tagWeights, MAX_TAGS);
  next.venueWeights = sanitizeWeights(next.venueWeights, MAX_VENUES);
  next.artistWeights = sanitizeWeights(next.artistWeights, MAX_ARTISTS);

  return next;
}

export const TASTE_LIMITS = { MAX_TAGS, MAX_VENUES, MAX_ARTISTS, DECAY_FACTOR };
