import NextAuth from "next-auth";
import { assertAuthConfig, authOptions } from "@/lib/auth";

export const runtime = "nodejs";

const handler = NextAuth(authOptions);

function missingAuthConfigResponse() {
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
