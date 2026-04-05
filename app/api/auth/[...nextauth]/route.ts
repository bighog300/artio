import NextAuth from "next-auth";
import { assertAuthConfig, authOptions } from "@/lib/auth";

export const runtime = "nodejs";
console.log("NEXTAUTH ROUTE HIT");

const handler = NextAuth(authOptions);

function missingAuthConfigResponse() {
  console.error("[auth] Auth is not configured. AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET must be set.");
  return Response.json({ error: "Auth is not configured." }, { status: 500 });
}

export async function GET(req: Request, ctx: unknown) {
  if (!assertAuthConfig()) return missingAuthConfigResponse();
  return handler(req, ctx as never);
}

export async function POST(req: Request, ctx: unknown) {
  if (!assertAuthConfig()) return missingAuthConfigResponse();
  return handler(req, ctx as never);
}
