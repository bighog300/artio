ALTER TABLE "DirectorySource"
ADD COLUMN "linkPattern" TEXT,
ADD COLUMN "lastRunFound" INTEGER,
ADD COLUMN "lastRunStrategy" TEXT,
ADD COLUMN "lastRunError" TEXT;
