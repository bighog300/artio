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

export function preprocessHtml(html: string): string {
  const withoutScripts = removeNonLdJsonScriptBlocks(html);
  const withoutStyles = withoutScripts.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  const withoutSvg = withoutStyles.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "");
  const withoutNoscript = withoutSvg.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "");
  const withoutComments = withoutNoscript.replace(/<!--[\s\S]*?-->/g, "");
  return withoutComments.replace(/\s+/g, " ").trim();
}
