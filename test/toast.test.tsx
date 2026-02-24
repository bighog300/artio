import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ToastCard, ToastViewport } from "../components/ui/toast";
import { enqueueToast } from "../lib/toast";

test("toast enqueue renders viewport", () => {
  enqueueToast({ title: "Saved" });
  const html = renderToStaticMarkup(<ToastViewport />);
  assert.match(html, /aria-live="polite"/);
});

test("toast title text is visible and message uses muted text", () => {
  const html = renderToStaticMarkup(
    <ToastCard
      item={{
        id: "toast-1",
        title: "Saved successfully",
        message: "Your changes are live",
        variant: "success",
      }}
    />,
  );

  assert.match(html, /Saved successfully/);
  assert.match(html, /bg-card/);
  assert.match(html, /text-card-foreground/);
  assert.match(html, /text-muted-foreground/);
  assert.doesNotMatch(html, /text-transparent/);
});
