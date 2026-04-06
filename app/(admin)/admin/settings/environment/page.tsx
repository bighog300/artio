import { requireAdmin } from "@/lib/admin";
import { ENV_DEFINITIONS } from "./env-definitions";
import EnvStatusClient from "./env-status-client";

export const dynamic = "force-dynamic";

export default async function EnvironmentStatusPage() {
  await requireAdmin();

  const statusMap: Record<string, boolean> = {};
  for (const def of ENV_DEFINITIONS) {
    const val = process.env[def.key];
    statusMap[def.key] = Boolean(val && String(val).trim().length > 0);
  }

  return <EnvStatusClient definitions={ENV_DEFINITIONS} statusMap={statusMap} />;
}
