import test from "node:test";
import assert from "node:assert/strict";
import { discoverEventImageUrl } from "../../lib/ingest/image-discovery";

test("discoverEventImageUrl returns og:image first", () => {
  const html = `
    <html><head>
      <meta property="og:image" content="/images/event-hero.jpg" />
      <meta name="twitter:image" content="/images/twitter.jpg" />
    </head></html>
  `;

  const result = discoverEventImageUrl({
    sourceUrl: "https://venue.example/events/show",
    venueWebsiteUrl: "https://venue.example",
    html,
  });

  assert.equal(result, "https://venue.example/images/event-hero.jpg");
});

test("discoverEventImageUrl falls back to best non-logo img", () => {
  const html = `
    <html><body>
      <img src="/assets/logo.png" width="800" height="200" />
      <img src="/gallery/photo-small.jpg" width="150" height="120" />
      <img src="/events/feature.jpg" width="1200" height="800" />
    </body></html>
  `;

  const result = discoverEventImageUrl({
    sourceUrl: "https://venue.example/program",
    html,
  });

  assert.equal(result, "https://venue.example/events/feature.jpg");
});
