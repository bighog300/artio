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


test("discoverEventImageUrl uses srcset largest width over src", () => {
  const html = `
    <html><body>
      <img
        src="/events/small.jpg"
        srcset="/events/medium.jpg 600w, /events/large.jpg 1200w, /events/small.jpg 300w"
        width="1200" height="800"
      />
    </body></html>
  `;

  const result = discoverEventImageUrl({
    sourceUrl: "https://venue.example/program",
    html,
  });

  assert.equal(result, "https://venue.example/events/large.jpg");
});

test("discoverEventImageUrl uses data-src when src is placeholder", () => {
  const html = `
    <html><body>
      <img
        src="/assets/placeholder.gif"
        data-src="/events/real-image.jpg"
        width="1200" height="800"
      />
    </body></html>
  `;

  const result = discoverEventImageUrl({
    sourceUrl: "https://venue.example/events/show",
    html,
  });

  assert.equal(result, "https://venue.example/events/real-image.jpg");
});

test("discoverEventImageUrl uses data-lazy-src when no src or data-src", () => {
  const html = `
    <html><body>
      <img
        data-lazy-src="/exhibitions/feature.jpg"
        width="900" height="600"
      />
    </body></html>
  `;

  const result = discoverEventImageUrl({
    sourceUrl: "https://venue.example/exhibitions",
    html,
  });

  assert.equal(result, "https://venue.example/exhibitions/feature.jpg");
});

test("discoverEventImageUrl picks highest density from x-descriptor srcset", () => {
  const html = `
    <html><body>
      <img
        srcset="/events/image-1x.jpg 1x, /events/image-2x.jpg 2x"
        width="800" height="600"
      />
    </body></html>
  `;

  const result = discoverEventImageUrl({
    sourceUrl: "https://venue.example/events/123",
    html,
  });

  assert.equal(result, "https://venue.example/events/image-2x.jpg");
});
