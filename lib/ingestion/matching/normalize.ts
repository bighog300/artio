const STOPWORDS = new Set(["the", "studio", "gallery", "artist", "and", "of"]);

export function normalizeArtistName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token && !STOPWORDS.has(token))
    .join(" ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[a.length][b.length];
}

export function fuzzyArtistConfidence(a: string, b: string): number {
  const left = normalizeArtistName(a);
  const right = normalizeArtistName(b);
  if (!left || !right) return 0;
  const maxLen = Math.max(left.length, right.length);
  const distance = levenshtein(left, right);
  return Number((1 - distance / maxLen).toFixed(3));
}
