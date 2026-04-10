export type Platform =
  | "artlogic"
  | "squarespace"
  | "wix"
  | "wordpress"
  | "eventbrite"
  | "framer"
  | "cargo"
  | "webflow"
  | "unknown";

function toHostname(input: string): string {
  try {
    return new URL(input).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function detectPlatform(html: string, url: string): Platform {
  const normalizedHtml = html.toLowerCase();
  const hostname = toHostname(url);

  if (
    hostname === "www.eventbrite.com"
    || hostname === "www.eventbrite.co.uk"
    || hostname === "www.eventbrite.com.au"
    || hostname.endsWith(".eventbrite.com")
  ) {
    return "eventbrite";
  }

  if (hostname.endsWith(".artlogic.net") || normalizedHtml.includes("artlogic.net")) {
    return "artlogic";
  }

  if (
    normalizedHtml.includes("static.wixstatic.com")
    || normalizedHtml.includes("wix-code-sdk")
    || normalizedHtml.includes("x-wix-published-version")
  ) {
    return "wix";
  }

  if (normalizedHtml.includes("static.squarespace.com") || normalizedHtml.includes("squarespace-cdn.com")) {
    return "squarespace";
  }

  if (
    normalizedHtml.includes("webflow.io")
    || (normalizedHtml.includes("name=\"generator\"") && normalizedHtml.includes("content=\"webflow\""))
    || (normalizedHtml.includes("name='generator'") && normalizedHtml.includes("content='webflow'"))
  ) {
    return "webflow";
  }

  if (normalizedHtml.includes("framerusercontent.com") || normalizedHtml.includes("framer.com/m/")) {
    return "framer";
  }

  if (hostname.endsWith(".cargo.site") || normalizedHtml.includes("cargocollective.com")) {
    return "cargo";
  }

  if (normalizedHtml.includes("/wp-content/") || normalizedHtml.includes("/wp-includes/")) {
    return "wordpress";
  }

  return "unknown";
}

export function getPlatformPromptHint(platform: Platform): string | null {
  if (platform === "artlogic") {
    return "This page is served by Artlogic. Exhibitions appear in article or list elements with class names containing 'exhibition'. Dates are typically in a separate element near the title.";
  }

  if (platform === "squarespace") {
    return "This page is built with Squarespace. Event blocks typically use class names containing 'eventlist' or 'summary-item'. Look for structured date and title elements within these blocks.";
  }

  if (platform === "wordpress") {
    return "This page is built with WordPress. Events may use The Events Calendar plugin structure with class names containing 'tribe-event' or 'wp-block-event'.";
  }

  if (platform === "cargo") {
    return "This page is built with Cargo Collective. Content is often in project or item containers — look for exhibition titles and dates within these structures.";
  }

  if (platform === "webflow") {
    return "This page is built with Webflow. Look for collection list items and CMS-bound elements — event titles and dates are often within richtext or collection-item divs.";
  }

  return null;
}

export function isJsRenderedPlatform(platform: Platform): boolean {
  return platform === "wix" || platform === "framer";
}


export type VenueType = "gallery" | "museum" | "theatre" | "music" | "unknown";

export function detectVenueType(html: string, url: string): VenueType {
  const lower = html.toLowerCase();
  const hostname = toHostname(url);

  // Music signals take precedence over gallery signals on music venue sites
  if (
    /\b(concert|gig|setlist|soundcheck|headliner|support act|dj set)\b/.test(lower) &&
    !/\b(exhibition|artwork|gallery|curator|artlogic)\b/.test(lower)
  ) {
    return "music";
  }

  if (/\b(theatre|theater|play|playwright|matinee|performance|stage door|curtain up)\b/.test(lower)) {
    return "theatre";
  }

  if (/\b(museum|permanent collection|curatorial|artefact|artifact|heritage)\b/.test(lower)) {
    return "museum";
  }

  if (
    /\b(exhibition|gallery|artlogic|opening night|private view|vernissage|solo show|group show|artwork)\b/.test(lower) ||
    hostname.endsWith(".artlogic.net")
  ) {
    return "gallery";
  }

  return "unknown";
}

export function getVenueTypePromptHint(type: VenueType): string | null {
  switch (type) {
    case "gallery":
      return "This is an art gallery. Focus on exhibition titles, participating artist names, and opening/closing dates. 'Opening' or 'private view' events mark the start of an exhibition run — extract these as events. Do not extract the exhibition run itself as a single event if individual opening dates are available.";
    case "museum":
      return "This is a museum. Extract temporary exhibitions and public programmes. Permanent collection displays are not events. Multi-week exhibitions should use the opening date as startAt.";
    case "theatre":
      return "This is a theatre. Extract individual performances with their specific dates — not the full production run. Cast members are performers, not visual artists. The 'artistNames' field should be left empty unless an artist is explicitly credited.";
    case "music":
      return "This is a music venue. Extract individual shows with their specific date. Headlining and support acts go in artistNames. Do not extract 'doors open' or 'soundcheck' times as separate events.";
    default:
      return null;
  }
}
