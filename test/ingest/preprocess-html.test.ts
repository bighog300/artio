import test from "node:test";
import assert from "node:assert/strict";
import { extractMainContent, preprocessHtml } from "@/lib/ingest/preprocess-html";

function longContent(prefix: string): string {
  return `${prefix} ${"details ".repeat(80)}`;
}

test("extractMainContent returns <main> content when sufficiently long", () => {
  const main = `<main>${longContent("Main body")}</main>`;
  const html = `<html><body><header>Nav</header>${main}<footer>Footer</footer></body></html>`;
  assert.equal(extractMainContent(html), longContent("Main body").trim());
});

test("extractMainContent returns <article> content when sufficiently long", () => {
  const article = longContent("Article body");
  const html = `<section><article>${article}</article></section>`;
  assert.equal(extractMainContent(html), article.trim());
});

test("extractMainContent returns id=content wrapper when sufficiently long", () => {
  const content = longContent("Content wrapper");
  const html = `<div id=\"content\">${content}</div>`;
  assert.equal(extractMainContent(html), content.trim());
});

test("extractMainContent falls back to full html when matched content is too short", () => {
  const html = "<html><main>short content</main><p>Outside</p></html>";
  assert.equal(extractMainContent(html), html);
});

test("extractMainContent falls back to full html when no wrapper matches", () => {
  const html = "<html><body><div>Only generic container</div></body></html>";
  assert.equal(extractMainContent(html), html);
});

test("extractMainContent handles empty string", () => {
  assert.equal(extractMainContent(""), "");
});

test("removes script with no type attribute and its contents", () => {
  const html = '<div>Before</div><script>console.log("x")</script><div>After</div>';
  assert.equal(preprocessHtml(html), "<div>Before</div><div>After</div>");
});

test("removes script type text/javascript and contents", () => {
  const html = '<script type="text/javascript">var x = 1;</script><p>Event</p>';
  assert.equal(preprocessHtml(html), "<p>Event</p>");
});

test("removes script type module and contents", () => {
  const html = '<script type="module">import x from "./x";</script><p>Event</p>';
  assert.equal(preprocessHtml(html), "<p>Event</p>");
});

test("preserves script type application/ld+json block verbatim", () => {
  const html = '<script type="application/ld+json">{\n  "@type": "Event",\n  "name": "Show"\n}</script>';
  assert.equal(preprocessHtml(html), '<script type="application/ld+json">{ "@type": "Event", "name": "Show" }</script>');
});

test("preserves script type APPLICATION/LD+JSON case-insensitively", () => {
  const html = '<script type="APPLICATION/LD+JSON">{"@type":"Event"}</script>';
  assert.equal(preprocessHtml(html), '<script type="APPLICATION/LD+JSON">{"@type":"Event"}</script>');
});

test("when page has JS script and ld+json script only JS script is removed", () => {
  const html = [
    '<script>window.x = true;</script>',
    '<script type="application/ld+json">{"@type":"Event","name":"Keep"}</script>',
  ].join("");
  assert.equal(
    preprocessHtml(html),
    '<script type="application/ld+json">{"@type":"Event","name":"Keep"}</script>',
  );
});

test("multi-line script content is fully removed", () => {
  const html = '<div>A</div><script>\nline1\nline2\n</script><div>B</div>';
  assert.equal(preprocessHtml(html), "<div>A</div><div>B</div>");
});

test("script tag immediately followed by another tag is handled correctly", () => {
  const html = '<script>bad()</script><article>Good</article>';
  assert.equal(preprocessHtml(html), "<article>Good</article>");
});

test("removes style block and contents", () => {
  const html = '<style>.x{color:red}</style><p>Body</p>';
  assert.equal(preprocessHtml(html), "<p>Body</p>");
});

test("inline style attribute is not removed", () => {
  const html = '<p style="color:red">Body</p>';
  assert.equal(preprocessHtml(html), '<p style="color:red">Body</p>');
});

test("removes svg block and all nested content", () => {
  const html = '<div>Icon</div><svg><g><path d="M1 1"/></g></svg><div>Text</div>';
  assert.equal(preprocessHtml(html), "<div>Icon</div><div>Text</div>");
});

test("svg with xmlns attribute is removed", () => {
  const html = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8"/></svg><p>Event</p>';
  assert.equal(preprocessHtml(html), "<p>Event</p>");
});

test("content after closing svg is preserved", () => {
  const html = '<svg><rect/></svg><article>After</article>';
  assert.equal(preprocessHtml(html), "<article>After</article>");
});

test("removes noscript block and contents", () => {
  const html = '<noscript><p>Fallback</p></noscript><p>Real</p>';
  assert.equal(preprocessHtml(html), "<p>Real</p>");
});

test("removes single-line HTML comments", () => {
  const html = '<p>A</p><!-- comment --><p>B</p>';
  assert.equal(preprocessHtml(html), "<p>A</p><p>B</p>");
});

test("removes multi-line HTML comments", () => {
  const html = '<p>A</p><!--\ncomment\nblock\n--><p>B</p>';
  assert.equal(preprocessHtml(html), "<p>A</p><p>B</p>");
});

test("collapses multiple spaces to one", () => {
  assert.equal(preprocessHtml("A    B"), "A B");
});

test("collapses newlines and tabs to one space", () => {
  assert.equal(preprocessHtml("A\n\tB"), "A B");
});

test("trims leading and trailing whitespace", () => {
  assert.equal(preprocessHtml("   A B   \n"), "A B");
});

test("combined preprocessing keeps article and ld+json while removing noise", () => {
  const html = `
    <html>
      <head>
        <style>
          .hero { color: red; }
        </style>
        <script>
          window.analytics = true;
        </script>
        <script type="application/ld+json">
          {"@context":"https://schema.org","@type":"Event","name":"Gallery Opening"}
        </script>
      </head>
      <body>
        <!-- page comment -->
        <svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>
        <article>
          <h1>Gallery Opening</h1>
          <p>Friday at 7pm</p>
        </article>
      </body>
    </html>
  `;

  const output = preprocessHtml(html);
  assert.match(output, /<article> <h1>Gallery Opening<\/h1> <p>Friday at 7pm<\/p> <\/article>/);
  assert.match(output, /<script type="application\/ld\+json"> \{"@context":"https:\/\/schema.org","@type":"Event","name":"Gallery Opening"\} <\/script>/);
  assert.doesNotMatch(output, /window\.analytics/);
  assert.doesNotMatch(output, /\.hero \{ color: red; \}/);
  assert.doesNotMatch(output, /<svg/);
});

test("preprocessHtml with full page and <main> extracts main content", () => {
  const html = `<html><body><header>Nav</header><main>${longContent("Main integration")}</main><footer>Footer</footer></body></html>`;
  const output = preprocessHtml(html);
  assert.ok(output.length < html.length);
  assert.ok(output.includes("Main integration"));
  assert.ok(!output.includes("<header>Nav</header>"));
});

test("preprocessHtml without matching wrapper remains non-empty", () => {
  const html = "<html><body><div>Generic body content that still has useful text.</div></body></html>";
  const output = preprocessHtml(html);
  assert.ok(output.length > 0);
});

test("output length is less than input length for non-trivial HTML", () => {
  const html = '<html>\n<style>.x{display:none}</style>\n<script>console.log(1)</script>\n<div>Event</div>\n</html>';
  const output = preprocessHtml(html);
  assert.ok(output.length < html.length);
});
