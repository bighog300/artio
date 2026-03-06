import { db } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";

type SearchParams = Promise<{ token?: string; email?: string }>;

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { token, email } = await searchParams;

  if (!token || !email || !verifyUnsubscribeToken(email, token)) {
    return <p>This unsubscribe link is invalid or has expired.</p>;
  }

  await db.emailUnsubscribe.upsert({
    where: { email: email.toLowerCase() },
    create: {
      email: email.toLowerCase(),
      token,
      source: "BROADCAST",
    },
    update: {},
  });

  return <p>You&apos;ve been unsubscribed. You won&apos;t receive further emails from Artpulse.</p>;
}
