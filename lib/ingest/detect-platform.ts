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
