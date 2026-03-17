import * as Sentry from "@sentry/nextjs";

const isTest =
  process.env.NODE_ENV === "test" ||
  process.env.PLAYWRIGHT === "true" ||
  process.env.CI === "true";

if (!isTest && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),
    sendDefaultPii: false,
  });
}
