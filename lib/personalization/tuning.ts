export const PERSONALIZATION_VERSION = "v3_1";
export const PERSONALIZATION_VERSION_LEGACY = "v3" as const;
export const PERSONALIZATION_EXPOSURE_SAMPLE_RATE_PROD = 0.25;

export const DEFAULT_WEIGHTS = {
  followedVenue: 40,
  followedArtist: 35,
  savedSearchQuery: 25,
  savedSearchTag: 20,
  recentViewMatch: 15,
  nearby: 10,
  forYouBaseline: 5,
  downrankVenue: -35,
  downrankArtist: -35,
  downrankTag: -25,
  tasteTagMultiplier: 8,
  tasteVenueMultiplier: 12,
  tasteArtistMultiplier: 10,
  dowMultiplier: 6,
  daypartMultiplier: 6,
  soonBoost: 8,
  weekendBoost: 10,
  pastPenalty: -200,
  tasteWeightMin: -3,
  tasteWeightMax: 3,
  tasteDeltaClick: 0.2,
  tasteDeltaSave: 0.4,
  tasteDeltaAttend: 0.6,
  tasteDeltaFollow: 0.5,
  tasteDeltaShowLess: -0.6,
  tasteDeltaHide: -0.8,
  tasteTimeDeltaClick: 0.05,
  tasteTimeDeltaSave: 0.05,
  tasteTimeDeltaAttend: 0.08,
  tasteTimeDeltaShowLess: -0.05,
  tasteTimeDeltaHide: -0.05,
} as const;

export const DEFAULT_LIMITS = {
  diversityTopWindow: 10,
  venueCapInTopWindow: 2,
  tagStreakCap: 3,
  explorationRate: 0.2,
  maxExposurePerView: 20,
  attributionWindowMs: 30 * 60 * 1000,
  metricsExposureEmitStep: 20,
} as const;

export const DEFAULT_DECAY = 0.98;
export const DEFAULT_CAPS = 200;

export type PersonalizationTuning = {
  weights: typeof DEFAULT_WEIGHTS;
  limits: typeof DEFAULT_LIMITS;
  decay: number;
  caps: number;
};

const OVERRIDE_KEY = "ap_tuning_overrides_v3";
const tuningDefaults: PersonalizationTuning = {
  weights: DEFAULT_WEIGHTS,
  limits: DEFAULT_LIMITS,
  decay: DEFAULT_DECAY,
  caps: DEFAULT_CAPS,
};

function canUseOverrides() {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_PERSONALIZATION_DEBUG === "true";
}

function safeStorageGet(key: string) {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readOverrides(): Partial<PersonalizationTuning> | null {
  if (!canUseOverrides()) return null;
  const raw = safeStorageGet(OVERRIDE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersonalizationTuning>;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function mergeTuning(base: PersonalizationTuning, overrides: Partial<PersonalizationTuning> | null): PersonalizationTuning {
  if (!overrides) return base;
  return {
    weights: { ...base.weights, ...(overrides.weights ?? {}) },
    limits: { ...base.limits, ...(overrides.limits ?? {}) },
    decay: typeof overrides.decay === "number" && Number.isFinite(overrides.decay) ? overrides.decay : base.decay,
    caps: typeof overrides.caps === "number" && Number.isFinite(overrides.caps) ? overrides.caps : base.caps,
  };
}

export function getPersonalizationTuning(): PersonalizationTuning {
  return mergeTuning(tuningDefaults, readOverrides());
}

export const TUNING_OVERRIDE_KEY = OVERRIDE_KEY;
