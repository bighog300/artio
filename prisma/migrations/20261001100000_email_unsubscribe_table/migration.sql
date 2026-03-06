CREATE TABLE IF NOT EXISTS "EmailUnsubscribe" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "reason" TEXT,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailUnsubscribe_email_key" ON "EmailUnsubscribe"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailUnsubscribe_token_key" ON "EmailUnsubscribe"("token");
