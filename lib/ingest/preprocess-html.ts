const MINIMUM_CONTENT_LENGTH = 500;

const CONTENT_PATTERNS: RegExp[] = [
  /<main\b[^>]*>([\s\S]*?)<\/main>/i,
  /<article\b[^>]*>([\s\S]*?)<\/article>/i,
  /<[a-z]+[^>]+\bid\s*=\s*["'](?:content|main|events?|exhibitions?|programme|program|whats-on)[^"']*["'][^>]*>([\s\S]*?)<\/[a-z]+>/i,
  /<[a-z]+[^>]+\bclass\s*=\s*["'][^"']*(?:main-content|page-content|site-content|event-list|exhibition-list|programme)[^"']*["'][^>]*>([\s\S]*?)<\/[a-z]+>/i,
];

function isLdJsonScript(openingTag: string): boolean {
  const typeMatch = openingTag.match(/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
  if (!typeMatch) return false;

  const rawType = typeMatch[1] ?? typeMatch[2] ?? typeMatch[3] ?? "";
  return rawType.trim().toLowerCase() === "application/ld+json";
}

function removeNonLdJsonScriptBlocks(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (match) => {
    const openingTagMatch = match.match(/^<script\b[^>]*>/i);
    if (!openingTagMatch) return "";
    return isLdJsonScript(openingTagMatch[0]) ? match : "";
  });
}

export function extractMainContent(html: string): string {
  for (const pattern of CONTENT_PATTERNS) {
    const match = html.match(pattern);
    const candidate = match?.[1]?.trim() ?? "";
    if (candidate.length >= MINIMUM_CONTENT_LENGTH) {
      return candidate;
    }
  }

  return html;
}

export function preprocessHtml(html: string): string {
  const withoutScripts = removeNonLdJsonScriptBlocks(html);
  const withoutStyles = withoutScripts.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  const withoutSvg = withoutStyles.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "");
  const withoutNoscript = withoutSvg.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "");
  const withoutComments = withoutNoscript.replace(/<!--[\s\S]*?-->/g, "");
  const mainContent = extractMainContent(withoutComments);
  return mainContent.replace(/\s+/g, " ").trim();
}
