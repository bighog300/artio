import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

function seedAllowed() {
  if (process.env.SEED_ENABLED === "true") return true;
  const env = (process.env.APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || "").toLowerCase();
  return env === "staging" || env === "preview" || env === "ci" || env === "test";
}

async function run() {
  if (!seedAllowed()) {
    console.log("Seed skipped: set SEED_ENABLED=true for local runs (or use staging/preview/ci env).");
    return;
  }

  const summary = { created: 0, updated: 0, linked: 0 };

  async function trackedUpsert(model: any, args: any) {
    const existing = await model.findUnique({ where: args.where, select: { id: true } });
    const result = await model.upsert(args);
    summary[existing ? "updated" : "created"] += 1;
    return result;
  }

  const adminEmail = process.env.ARTPULSE_ADMIN_EMAIL;
  const adminName = process.env.ARTPULSE_ADMIN_NAME || "Preview Admin";

  if (adminEmail) {
    await trackedUpsert(db.user, {
      where: { email: adminEmail.toLowerCase() },
      update: { role: "ADMIN", name: adminName },
      create: { email: adminEmail.toLowerCase(), name: adminName, role: "ADMIN" },
    });
  }

  const TAXONOMY_TAGS = [
    { name: "Painting", slug: "painting", category: "medium" },
    { name: "Drawing", slug: "drawing", category: "medium" },
    { name: "Photography", slug: "photography", category: "medium" },
    { name: "Sculpture", slug: "sculpture", category: "medium" },
    { name: "Printmaking", slug: "printmaking", category: "medium" },
    { name: "Ceramics", slug: "ceramics", category: "medium" },
    { name: "Textile", slug: "textile", category: "medium" },
    { name: "Video Art", slug: "video-art", category: "medium" },
    { name: "Performance Art", slug: "performance-art", category: "medium" },
    { name: "Installation", slug: "installation", category: "medium" },
    { name: "Digital Art", slug: "digital-art", category: "medium" },
    { name: "Mixed Media", slug: "mixed-media", category: "medium" },
    { name: "Collage", slug: "collage", category: "medium" },
    { name: "Film", slug: "film", category: "medium" },
    { name: "Sound Art", slug: "sound-art", category: "medium" },
    { name: "New Media", slug: "new-media", category: "medium" },
    { name: "Portrait", slug: "portrait", category: "genre" },
    { name: "Landscape", slug: "landscape", category: "genre" },
    { name: "Abstract", slug: "abstract", category: "genre" },
    { name: "Still Life", slug: "still-life", category: "genre" },
    { name: "Figurative", slug: "figurative", category: "genre" },
    { name: "Street Art", slug: "street-art", category: "genre" },
    { name: "Documentary Photography", slug: "documentary-photography", category: "genre" },
    { name: "Fashion", slug: "fashion", category: "genre" },
    { name: "Architecture", slug: "architecture", category: "genre" },
    { name: "Wildlife", slug: "wildlife", category: "genre" },
    { name: "Sports", slug: "sports", category: "genre" },
    { name: "Botanical", slug: "botanical", category: "genre" },
    { name: "Contemporary", slug: "contemporary", category: "movement" },
    { name: "Modern", slug: "modern", category: "movement" },
    { name: "Expressionism", slug: "expressionism", category: "movement" },
    { name: "Surrealism", slug: "surrealism", category: "movement" },
    { name: "Minimalism", slug: "minimalism", category: "movement" },
    { name: "Conceptual Art", slug: "conceptual-art", category: "movement" },
    { name: "Pop Art", slug: "pop-art", category: "movement" },
    { name: "Impressionism", slug: "impressionism", category: "movement" },
    { name: "Bauhaus", slug: "bauhaus", category: "movement" },
    { name: "Futurism", slug: "futurism", category: "movement" },
    { name: "Dada", slug: "dada", category: "movement" },
    { name: "Arte Povera", slug: "arte-povera", category: "movement" },
    { name: "Free Entry", slug: "free-entry", category: "mood" },
    { name: "Family Friendly", slug: "family-friendly", category: "mood" },
    { name: "Opening Night", slug: "opening-night", category: "mood" },
    { name: "Immersive", slug: "immersive", category: "mood" },
    { name: "Interactive", slug: "interactive", category: "mood" },
    { name: "Outdoor", slug: "outdoor", category: "mood" },
    { name: "Pop-up", slug: "pop-up", category: "mood" },
    { name: "Charity", slug: "charity", category: "mood" },
    { name: "Award Show", slug: "award-show", category: "mood" },
  ] as const;

  const venues = [
    { slug: "modern-gallery", name: "Modern Gallery", city: "London" },
    { slug: "riverfront-arts", name: "Riverfront Arts", city: "Manchester" },
  ];

  const artists = [
    { slug: "jane-doe", name: "Jane Doe", bio: "Contemporary artist" },
    { slug: "liam-ng", name: "Liam Ng", bio: "Sculptor exploring recycled materials" },
    { slug: "amina-khan", name: "Amina Khan", bio: "Photographer focused on night scenes" },
  ];

  const artworks = [
    { slug: "jane-dawn-study", title: "Dawn Study", artistSlug: "jane-doe" },
    { slug: "liam-reframed-steel", title: "Reframed Steel", artistSlug: "liam-ng" },
  ];

  const tagBySlug = new Map<string, { id: string }>();
  for (const tag of TAXONOMY_TAGS) {
    const existing = await db.tag.findUnique({ where: { slug: tag.slug }, select: { id: true } });
    const result = await db.tag.upsert({
      where: { slug: tag.slug },
      update: { name: tag.name, category: tag.category },
      create: { name: tag.name, slug: tag.slug, category: tag.category },
    });
    summary[existing ? "updated" : "created"] += 1;
    tagBySlug.set(tag.slug, { id: result.id });
  }

  const venueBySlug = new Map<string, { id: string }>();
  for (const venue of venues) {
    const result = await trackedUpsert(db.venue, {
      where: { slug: venue.slug },
      update: { name: venue.name, city: venue.city, isPublished: true },
      create: { ...venue, isPublished: true },
    });
    venueBySlug.set(venue.slug, { id: result.id });
  }

  const artistBySlug = new Map<string, { id: string }>();
  for (const artist of artists) {
    const result = await trackedUpsert(db.artist, {
      where: { slug: artist.slug },
      update: { name: artist.name, bio: artist.bio, isPublished: true },
      create: { ...artist, isPublished: true },
    });
    artistBySlug.set(artist.slug, { id: result.id });
  }

  for (const artwork of artworks) {
    const artistId = artistBySlug.get(artwork.artistSlug)?.id;
    if (!artistId) continue;

    await trackedUpsert(db.artwork, {
      where: { slug: artwork.slug },
      update: {
        title: artwork.title,
        artistId,
        isPublished: true,
        status: "PUBLISHED",
      },
      create: {
        slug: artwork.slug,
        title: artwork.title,
        artistId,
        isPublished: true,
        status: "PUBLISHED",
      },
    });
  }

  const now = Date.now();
  const events = Array.from({ length: 10 }, (_, i) => {
    const day = i + 1;
    const startAt = new Date(now + (7 + day) * 24 * 60 * 60 * 1000);
    startAt.setUTCHours(18, 0, 0, 0);

    return {
      slug: `preview-event-${day}`,
      title: `Preview Event ${day}`,
      startAt,
      venueSlug: i % 2 === 0 ? "modern-gallery" : "riverfront-arts",
      artistSlug: artists[i % artists.length].slug,
      tagSlugs: i % 2 === 0 ? ["photography", "free-entry"] : ["sculpture", "performance"],
    };
  });

  for (const event of events) {
    const venueId = venueBySlug.get(event.venueSlug)?.id;
    if (!venueId) continue;

    const eventRecord = await trackedUpsert(db.event, {
      where: { slug: event.slug },
      update: {
        title: event.title,
        timezone: "UTC",
        startAt: event.startAt,
        venueId,
        isPublished: true,
        publishedAt: { set: new Date("2026-02-01T00:00:00.000Z") },
      },
      create: {
        slug: event.slug,
        title: event.title,
        timezone: "UTC",
        startAt: event.startAt,
        venueId,
        isPublished: true,
        publishedAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    });

    const artistId = artistBySlug.get(event.artistSlug)?.id;
    if (artistId) {
      await db.eventArtist.upsert({
        where: { eventId_artistId: { eventId: eventRecord.id, artistId } },
        update: {},
        create: { eventId: eventRecord.id, artistId },
      });
      summary.linked += 1;
    }

    for (const tagSlug of event.tagSlugs) {
      const tagId = tagBySlug.get(tagSlug)?.id;
      if (!tagId) continue;
      await db.eventTag.upsert({
        where: { eventId_tagId: { eventId: eventRecord.id, tagId } },
        update: {},
        create: { eventId: eventRecord.id, tagId },
      });
      summary.linked += 1;
    }
  }

  console.log(`Seed summary: created=${summary.created} updated=${summary.updated} linked=${summary.linked}`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
