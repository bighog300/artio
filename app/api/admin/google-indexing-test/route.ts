import { unstable_noStore as noStore } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { apiError } from "@/lib/api";
import { isAuthError } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGoogleAccessTokenFromServiceAccount } from "@/lib/googleapis";

export const runtime = "nodejs";

export async function GET() {
  noStore();
  try {
    await requireAdmin();

    const settings = await db.siteSettings.findUnique({
      where: { id: "default" },
      select: { googleServiceAccountJson: true },
    });

    if (!settings?.googleServiceAccountJson) {
      return NextResponse.json(
        {
          ok: false,
          errorMessage: "No service account JSON configured",
          keyConfigured: false,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    let serviceAccount: {
      client_email: string;
      private_key: string;
    };

    try {
      serviceAccount = JSON.parse(settings.googleServiceAccountJson) as {
        client_email: string;
        private_key: string;
      };
    } catch {
      return NextResponse.json(
        {
          ok: false,
          errorMessage: "Service account JSON is not valid JSON",
          keyConfigured: true,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      return NextResponse.json(
        {
          ok: false,
          errorMessage: "Service account JSON is missing client_email or private_key",
          keyConfigured: true,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    const startedAt = Date.now();

    try {
      const token = await getGoogleAccessTokenFromServiceAccount(serviceAccount);

      if (!token) {
        return NextResponse.json(
          {
            ok: false,
            errorMessage: "Token acquisition returned empty — check service account permissions",
            keyConfigured: true,
            durationMs: Date.now() - startedAt,
          },
          { status: 200, headers: { "Cache-Control": "no-store" } },
        );
      }

      return NextResponse.json(
        {
          ok: true,
          keyConfigured: true,
          durationMs: Date.now() - startedAt,
          clientEmail: serviceAccount.client_email,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          keyConfigured: true,
          durationMs: Date.now() - startedAt,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }
  } catch (error) {
    if (isAuthError(error)) return apiError(401, "unauthorized", "Authentication required");
    if (error instanceof Error && error.message === "forbidden") return apiError(403, "forbidden", "Forbidden");
    console.error("admin_google_indexing_test_unexpected_error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return apiError(500, "internal_error", "Unexpected server error");
  }
}
