CREATE TABLE "ArtistIdentity" (
  "id"              UUID        NOT NULL,
  "canonicalName"   TEXT        NOT NULL,
  "normalizedName"  TEXT        NOT NULL,
  "nationality"     TEXT,
  "birthYear"       INTEGER,
  "bio"             TEXT,
  "mediums"         TEXT[]      NOT NULL DEFAULT '{}',
  "collections"     TEXT[]      NOT NULL DEFAULT '{}',
  "websiteUrl"      TEXT,
  "instagramUrl"    TEXT,
  "twitterUrl"      TEXT,
  "avatarUrl"       TEXT,
  "artistId"        UUID,
  "confidenceScore" INTEGER     NOT NULL DEFAULT 0,
  "confidenceBand"  TEXT        NOT NULL DEFAULT 'LOW',
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArtistIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArtistIdentity_normalizedName_key" ON "ArtistIdentity"("normalizedName");
CREATE UNIQUE INDEX "ArtistIdentity_artistId_key" ON "ArtistIdentity"("artistId");
CREATE INDEX "ArtistIdentity_artistId_idx" ON "ArtistIdentity"("artistId");

CREATE TABLE "ArtistObservation" (
  "id"              UUID        NOT NULL,
  "identityId"      UUID        NOT NULL,
  "sourceUrl"       TEXT        NOT NULL,
  "sourceDomain"    TEXT        NOT NULL,
  "siteProfileId"   UUID,
  "name"            TEXT        NOT NULL,
  "bio"             TEXT,
  "mediums"         TEXT[]      NOT NULL DEFAULT '{}',
  "collections"     TEXT[]      NOT NULL DEFAULT '{}',
  "websiteUrl"      TEXT,
  "instagramUrl"    TEXT,
  "twitterUrl"      TEXT,
  "avatarUrl"       TEXT,
  "birthYear"       INTEGER,
  "nationality"     TEXT,
  "exhibitionUrls"  TEXT[]      NOT NULL DEFAULT '{}',
  "confidenceScore" INTEGER     NOT NULL DEFAULT 0,
  "extractedAt"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArtistObservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArtistObservation_identityId_sourceDomain_key"
  ON "ArtistObservation"("identityId", "sourceDomain");
CREATE INDEX "ArtistObservation_identityId_idx" ON "ArtistObservation"("identityId");
CREATE INDEX "ArtistObservation_sourceDomain_idx" ON "ArtistObservation"("sourceDomain");
CREATE INDEX "ArtistObservation_sourceUrl_idx" ON "ArtistObservation"("sourceUrl");

ALTER TABLE "ArtistIdentity"
  ADD CONSTRAINT "ArtistIdentity_artistId_fkey"
  FOREIGN KEY ("artistId") REFERENCES "Artist"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ArtistObservation"
  ADD CONSTRAINT "ArtistObservation_identityId_fkey"
  FOREIGN KEY ("identityId") REFERENCES "ArtistIdentity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
