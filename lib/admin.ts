import { redirect } from "next/navigation";
import { isAuthError, requireAdmin as requireDbAdmin } from "@/lib/auth";
import { ForbiddenError } from "@/lib/http-errors";
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
  try {
    const user = await requireDbAdmin();
    return { email: user.email };
  } catch (error) {
    const status = isAuthError(error) ? 401 : error instanceof ForbiddenError ? 403 : null;
    if (status === 401 && options?.redirectOnFail !== false) redirect("/login");
    if (status === 403 && options?.redirectOnFail !== false) redirect("/");
    if (status) throw new AdminAccessError(status);
    throw error;
  }
}
