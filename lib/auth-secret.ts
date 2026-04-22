export type AuthSecretState = {
  nextAuthSecret: string;
  authSecret: string;
  hasNextAuthSecret: boolean;
  hasAuthSecret: boolean;
  hasMismatch: boolean;
  resolvedSecret: string;
};

function normalizeSecret(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getAuthSecretState(): AuthSecretState {
  const nextAuthSecret = normalizeSecret(process.env.NEXTAUTH_SECRET);
  const authSecret = normalizeSecret(process.env.AUTH_SECRET);
  const hasNextAuthSecret = nextAuthSecret.length > 0;
  const hasAuthSecret = authSecret.length > 0;

  return {
    nextAuthSecret,
    authSecret,
    hasNextAuthSecret,
    hasAuthSecret,
    hasMismatch: hasNextAuthSecret && hasAuthSecret && nextAuthSecret !== authSecret,
    resolvedSecret: nextAuthSecret || authSecret || "",
  };
}

export function getResolvedAuthSecret(): string {
  return getAuthSecretState().resolvedSecret;
}
