import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";

import { db } from "@/lib/db";
import { getAuthSecret } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "test") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { email, password } = (await req.json()) as { email?: string; password?: string };
  const expectedEmail = process.env.TEST_EMAIL;
  const expectedPassword = process.env.TEST_PASSWORD;

  if (!email || !password || !expectedEmail || !expectedPassword || email !== expectedEmail || password !== expectedPassword) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const user = await db.user.upsert({
    where: { email: expectedEmail.toLowerCase() },
    update: { name: "E2E User", role: "USER" },
    create: { email: expectedEmail.toLowerCase(), username: "e2e_user", name: "E2E User", displayName: "E2E User", role: "USER" },
  });

  const sessionToken = await encode({
    token: {
      sub: user.id,
      email: user.email,
      name: user.name ?? "",
      role: user.role,
    },
    secret: getAuthSecret(),
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set("next-auth.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
  });

  return res;
}
