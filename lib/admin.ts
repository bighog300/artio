import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin-email";

export { isAdminEmail } from "@/lib/admin-email";

export class AdminAccessError extends Error {
  status: 401 | 403;

  constructor(status: 401 | 403) {
    super(status === 401 ? "unauthorized" : "forbidden");
    this.status = status;
  }
}

export async function requireAdmin(options?: { redirectOnFail?: boolean }): Promise<{ email: string }> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;

  if (!email) {
    if (options?.redirectOnFail !== false) redirect("/login");
    throw new AdminAccessError(401);
  }

  if (!isAdminEmail(email)) {
    if (options?.redirectOnFail !== false) redirect("/");
    throw new AdminAccessError(403);
  }

  return { email };
}
