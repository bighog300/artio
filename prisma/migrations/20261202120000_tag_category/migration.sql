ALTER TABLE "Tag" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'medium'
  CONSTRAINT "Tag_category_check" CHECK ("category" IN ('medium','genre','movement','mood'));

CREATE INDEX "Tag_category_idx" ON "Tag"("category");
