import { redirect } from "next/navigation";
import { requireAdmin as requireAdminDB } from "@/lib/auth";

export { isAdminEmail } from "@/lib/admin-email";

export class AdminAccessError extends Error {
  status: 401 | 403;

  constructor(status: 401 | 403) {
    super(status === 401 ? "unauthorized" : "forbidden");
    this.status = status;
  }
}

export async function requireAdmin(options?: { redirectOnFail?: boolean }) {
  try {
    return await requireAdminDB();
  } catch (err) {
    const status = (err as { status?: number })?.status === 403 ? 403 : 401;
    if (options?.redirectOnFail !== false) {
      redirect(status === 401 ? "/login" : "/");
    }
    throw new AdminAccessError(status);
  }
}
