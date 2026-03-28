"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type PaymentsSettingsProps = {
  initial: {
    stripePublishableKey: string | null;
    stripeSecretKeySet: boolean;
    stripeWebhookSecretSet: boolean;
    platformFeePercent: number;
  };
};

type StripeTestResult = {
  ok: boolean;
  durationMs: number;
  mode?: "live" | "test";
  balanceCurrencies?: string[];
  errorMessage?: string;
  keyConfigured?: boolean;
};

export default function PaymentsSettingsClient(props: PaymentsSettingsProps) {
  const [stripePublishableKey, setStripePublishableKey] = useState(props.initial.stripePublishableKey ?? "");
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
  const [platformFeePercent, setPlatformFeePercent] = useState(String(props.initial.platformFeePercent));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stripeTestResult, setStripeTestResult] =
    useState<StripeTestResult | null>(null);
  const [stripeTesting, setStripeTesting] =
    useState(false);

  async function save() {
    setSaving(true);
    setStatus("idle");
    setErrorMessage(null);
    try {
      const parsedPlatformFeePercent = Number.parseInt(platformFeePercent.trim(), 10);
      const body = {
        stripePublishableKey: stripePublishableKey.trim() || null,
        stripeSecretKey: stripeSecretKey.trim() || null,
        stripeWebhookSecret: stripeWebhookSecret.trim() || null,
        platformFeePercent:
          Number.isInteger(parsedPlatformFeePercent) && parsedPlatformFeePercent >= 1 && parsedPlatformFeePercent <= 100
            ? parsedPlatformFeePercent
            : null,
      };
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setErrorMessage(data.error?.message ?? "Save failed.");
        setStatus("error");
        return;
      }
      setStatus("saved");
      setStripeSecretKey("");
      setStripeWebhookSecret("");
    } finally {
      setSaving(false);
    }
  }

  async function testStripe() {
    setStripeTesting(true);
    setStripeTestResult(null);
    try {
      const res = await fetch(
        "/api/admin/stripe-test");
      const data =
        await res.json() as StripeTestResult;
      setStripeTestResult(data);
    } catch {
      setStripeTestResult({
        ok: false,
        durationMs: 0,
        errorMessage: "Network error",
      });
    } finally {
      setStripeTesting(false);
    }
  }

  return (
    <section className="rounded-lg border bg-background p-4 space-y-6">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Payments</h2>
        <p className="text-sm text-muted-foreground">Configure Stripe credentials and platform fee settings.</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="stripe-publishable-key">
          Stripe Publishable Key
        </label>
        <input
          id="stripe-publishable-key"
          type="text"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={stripePublishableKey}
          onChange={(e) => {
            setStripePublishableKey(e.target.value);
            setStatus("idle");
          }}
          placeholder="pk_live_..."
          disabled={saving}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="stripe-secret-key">
          Stripe Secret Key
        </label>
        <input
          id="stripe-secret-key"
          type="password"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={stripeSecretKey}
          onChange={(e) => {
            setStripeSecretKey(e.target.value);
            setStatus("idle");
          }}
          placeholder={props.initial.stripeSecretKeySet ? "•••••••• (stored)" : "sk_live_..."}
          disabled={saving}
          autoComplete="off"
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            disabled={
              stripeTesting ||
              !props.initial.stripeSecretKeySet
            }
            onClick={() => void testStripe()}
            className="rounded border px-3 py-1.5 text-xs disabled:opacity-50 hover:bg-muted"
          >
            {stripeTesting ? "Testing…" : "Test Stripe"}
          </button>
          {!props.initial.stripeSecretKeySet && (
            <span className="text-xs text-muted-foreground">
              Save secret key first
            </span>
          )}
        </div>

        {stripeTestResult !== null ? (
          <div className={`mt-2 rounded border p-2 text-xs
            ${stripeTestResult.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
            }`}>
            {stripeTestResult.ok ? (
              <span>
                <span className="font-medium">
                  ✓ Connected
                </span>
                {" · "}{stripeTestResult.durationMs}ms
                {stripeTestResult.mode === "live" ? (
                  <span className="ml-2 font-semibold text-amber-700">
                    ⚠ LIVE MODE
                  </span>
                ) : (
                  <span className="ml-2 text-emerald-700">
                    · test mode
                  </span>
                )}
                {stripeTestResult.balanceCurrencies
                  ?.length ? (
                  <span className="ml-2 text-emerald-700 font-mono">
                    ·{" "}
                    {stripeTestResult.balanceCurrencies
                      .join(", ")}
                  </span>
                ) : null}
              </span>
            ) : (
              <span>
                <span className="font-medium">✗ Failed</span>
                {" · "}
                {stripeTestResult.errorMessage}
              </span>
            )}
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="stripe-webhook-secret">
          Stripe Webhook Secret
        </label>
        <input
          id="stripe-webhook-secret"
          type="password"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={stripeWebhookSecret}
          onChange={(e) => {
            setStripeWebhookSecret(e.target.value);
            setStatus("idle");
          }}
          placeholder={props.initial.stripeWebhookSecretSet ? "•••••••• (stored)" : "whsec_..."}
          disabled={saving}
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="platform-fee-percent">
          Platform Fee %
        </label>
        <input
          id="platform-fee-percent"
          type="number"
          min={1}
          max={100}
          step={1}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={platformFeePercent}
          onChange={(e) => {
            setPlatformFeePercent(e.target.value);
            setStatus("idle");
          }}
          placeholder="5"
          disabled={saving}
        />
      </div>


      <div className="flex items-center gap-3 pt-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>

      {status === "saved" ? (
        <div className="rounded border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-700">
          Settings saved.
        </div>
      ) : null}
      {status === "error" ? (
        <div className="flex items-center justify-between rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          <span>{errorMessage ?? "An error occurred."}</span>
          <button type="button" onClick={() => setStatus("idle")}>
            ×
          </button>
        </div>
      ) : null}
    </section>
  );
}
