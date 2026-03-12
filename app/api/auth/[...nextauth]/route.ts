import { assertAuthConfig, handlers } from "@/lib/auth";

export const runtime = "nodejs";

function missingAuthConfigResponse() {
  return Response.json({ error: "Auth is not configured." }, { status: 500 });
}

export async function GET(req: Request, ctx: unknown) {
  if (!assertAuthConfig()) return missingAuthConfigResponse();
  return handlers.GET(req, ctx as never);
}

export async function POST(req: Request, ctx: unknown) {
  if (!assertAuthConfig()) return missingAuthConfigResponse();
  return handlers.POST(req, ctx as never);
}
