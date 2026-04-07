"use client";

import Link from "next/link";
import { useState } from "react";

type ServiceStatus =
  | "unchecked"
  | "checking"
  | "ok"
  | "error"
  | "unconfigured";

type ServiceState = {
  status: ServiceStatus;
  durationMs?: number;
  detail?: string;
};

type ConnectivityPanelProps = {
  initial: {
    googlePseConfigured: boolean;
    braveConfigured: boolean;
    openAiConfigured: boolean;
    geminiConfigured: boolean;
    anthropicConfigured: boolean;
    resendConfigured: boolean;
    stripeConfigured: boolean;
    googleIndexingConfigured: boolean;
  };
};

const SERVICE_LABELS: Record<string, {
  label: string;
  tab: string;
}> = {
  googlePse:
    { label: "Google PSE", tab: "configuration" },
  brave:
    { label: "Brave Search", tab: "configuration" },
  openai:
    { label: "OpenAI", tab: "configuration" },
  gemini:
    { label: "Gemini", tab: "configuration" },
  claude:
    { label: "Anthropic", tab: "configuration" },
  resend:
    { label: "Resend", tab: "configuration" },
  stripe:
    { label: "Stripe", tab: "configuration" },
  googleIndexing:
    { label: "Google Indexing", tab: "configuration" },
};

const CONFIG_LINKS: Record<string, string> = {
  googlePseConfigured: "/admin/settings?tab=configuration",
  braveConfigured: "/admin/settings?tab=configuration",
  openAiConfigured: "/admin/settings?tab=configuration",
  geminiConfigured: "/admin/settings?tab=configuration",
  anthropicConfigured: "/admin/settings?tab=configuration",
  resendConfigured: "/admin/settings?tab=configuration",
  stripeConfigured: "/admin/settings?tab=configuration",
  googleIndexingConfigured: "/admin/settings?tab=configuration",
};

const SERVICE_CONFIG_KEYS: Record<string, keyof ConnectivityPanelProps["initial"]> = {
  googlePse: "googlePseConfigured",
  brave: "braveConfigured",
  openai: "openAiConfigured",
  gemini: "geminiConfigured",
  claude: "anthropicConfigured",
  resend: "resendConfigured",
  stripe: "stripeConfigured",
  googleIndexing: "googleIndexingConfigured",
};

function StatusDot({
  status,
}: { status: ServiceStatus }) {
  if (status === "unconfigured") {
    return (
      <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" />
    );
  }
  if (status === "unchecked") {
    return (
      <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
    );
  }
  if (status === "checking") {
    return (
      <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
    );
  }
  if (status === "ok") {
    return (
      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
    );
  }
  return (
    <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
  );
}

function ConnectivityPanel(props: ConnectivityPanelProps) {
  const [services, setServices] = useState<Record<string, ServiceState>>(() => ({
    googlePse: {
      status: props.initial.googlePseConfigured
        ? "unchecked" : "unconfigured",
    },
    brave: {
      status: props.initial.braveConfigured
        ? "unchecked" : "unconfigured",
    },
    openai: {
      status: props.initial.openAiConfigured
        ? "unchecked" : "unconfigured",
    },
    gemini: {
      status: props.initial.geminiConfigured
        ? "unchecked" : "unconfigured",
    },
    claude: {
      status: props.initial.anthropicConfigured
        ? "unchecked" : "unconfigured",
    },
    resend: {
      status: props.initial.resendConfigured
        ? "unchecked" : "unconfigured",
    },
    stripe: {
      status: props.initial.stripeConfigured
        ? "unchecked" : "unconfigured",
    },
    googleIndexing: {
      status: props.initial.googleIndexingConfigured
        ? "unchecked" : "unconfigured",
    },
  }));
  const [testing, setTesting] = useState(false);

  async function testAll() {
    setTesting(true);
    setServices((prev) => {
      const next = { ...prev };
      for (const [key, val] of Object.entries(next)) {
        if (val.status !== "unconfigured") {
          next[key] = { status: "checking" };
        }
      }
      return next;
    });

    try {
      const res = await fetch("/api/admin/connectivity-check");
      const data = await res.json() as {
        services: Record<string, {
          ok: boolean;
          configured: boolean;
          durationMs: number;
          detail?: string;
        }>;
      };

      setServices((prev) => {
        const next = { ...prev };
        for (const [key, result] of Object.entries(data.services)) {
          next[key] = {
            status: !result.configured
              ? "unconfigured"
              : result.ok ? "ok" : "error",
            durationMs: result.durationMs,
            detail: result.detail,
          };
        }
        return next;
      });
    } catch {
      setServices((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (next[key]?.status === "checking") {
            next[key] = {
              status: "error",
              durationMs: 0,
              detail: "Network error",
            };
          }
        }
        return next;
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="rounded-lg border bg-background p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold">
            API connectivity
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tests all configured external services.
            Results are not cached.
          </p>
        </div>
        <button
          type="button"
          disabled={testing}
          onClick={() => void testAll()}
          className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-muted"
        >
          {testing ? "Testing…" : "Test all"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        {Object.entries(SERVICE_LABELS).map(
          ([key, { label, tab }]) => {
            const svc = services[key] ?? {
              status: "unconfigured" as ServiceStatus,
            };
            const configKey = SERVICE_CONFIG_KEYS[key];
            const configured = props.initial[configKey];
            return (
              <div key={key} className="flex items-center gap-2 py-1">
                <StatusDot status={svc.status} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`?tab=${tab}`}
                    className="text-xs font-medium hover:underline truncate block"
                  >
                    {label}
                  </Link>
                  {svc.status === "unconfigured" ? (
                    <div className="flex items-center">
                      <p className="text-[10px] text-muted-foreground">
                        Not configured
                      </p>
                      {!configured ? (
                        <Link
                          href={CONFIG_LINKS[configKey]}
                          className="ml-2 text-xs text-muted-foreground underline hover:text-foreground"
                        >
                          Configure →
                        </Link>
                      ) : null}
                    </div>
                  ) : svc.status === "unchecked" ? (
                    <p className="text-[10px] text-muted-foreground">
                      Not tested
                    </p>
                  ) : svc.status === "checking" ? (
                    <p className="text-[10px] text-muted-foreground">
                      Checking…
                    </p>
                  ) : svc.status === "ok" ? (
                    <p className="text-[10px] text-emerald-700 truncate" title={svc.detail}>
                      {svc.durationMs}ms
                      {svc.detail
                        ? ` · ${svc.detail}`
                        : ""}
                    </p>
                  ) : (
                    <p className="text-[10px] text-rose-700 truncate" title={svc.detail}>
                      {svc.detail ?? "Failed"}
                    </p>
                  )}
                </div>
              </div>
            );
          },
        )}
      </div>
    </section>
  );
}

export { ConnectivityPanel };
