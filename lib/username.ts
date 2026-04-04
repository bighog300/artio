export function buildUsernameSeed(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .split("@")[0]
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20) || "user";
}

export async function ensureUniqueUsername(base: string): Promise<string> {
  const { db } = await import("@/lib/db");
  const seed = base || "user";
  for (let i = 0; i < 25; i += 1) {
    const suffix = i === 0 ? "" : `_${Math.random().toString(36).slice(2, 8)}`;
    const candidate = `${seed}${suffix}`.slice(0, 30);
    const exists = await db.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  return `${seed}_${Date.now().toString(36)}`.slice(0, 30);
}
