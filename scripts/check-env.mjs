#!/usr/bin/env node

function parseMode(argv) {
  const modeArg = argv.find((entry) => entry.startsWith("--mode="));
  if (!modeArg) return "auto";
  return modeArg.split("=")[1] || "auto";
}

const mode = parseMode(process.argv.slice(2));
const isDeployContext = process.env.VERCEL === "1" || process.env.CI === "true";
const shouldEnforce = mode === "vercel-build" || mode === "deploy" || (mode === "auto" && isDeployContext);
const nextAuthSecret = process.env.NEXTAUTH_SECRET?.trim() ?? "";
const authSecret = process.env.AUTH_SECRET?.trim() ?? "";
const hasNextAuthSecret = Boolean(nextAuthSecret && String(nextAuthSecret).trim().length > 0);
const hasAuthSecret = Boolean(authSecret && String(authSecret).trim().length > 0);

if (hasNextAuthSecret && hasAuthSecret && nextAuthSecret !== authSecret) {
  console.error("[check-env] AUTH_SECRET and NEXTAUTH_SECRET are both set but differ.");
  console.error("[check-env] This can cause a silent auth loop: middleware token verification and server session decryption use different keys.");
  console.error("[check-env] Set AUTH_SECRET and NEXTAUTH_SECRET to the same value.");
  process.exit(1);
}

if (hasNextAuthSecret !== hasAuthSecret) {
  const missingKey = hasNextAuthSecret ? "AUTH_SECRET" : "NEXTAUTH_SECRET";
  console.warn(`[check-env] ${missingKey} is missing.`);
  console.warn("[check-env] Set AUTH_SECRET and NEXTAUTH_SECRET to the same value for easier secret rotation and safer rollbacks.");
}

if (!shouldEnforce) {
  console.log("[check-env] non-deploy context detected; skipping strict checks");
  process.exit(0);
}

const requiredInDeploy = ["DATABASE_URL"];
const optional = ["DIRECT_URL"];
requiredInDeploy.push("CRON_SECRET");
if (process.env.VERCEL === "1") {
  requiredInDeploy.push("AI_INGEST_IMAGE_ENABLED");
}

const geocoderProvider = process.env.GEOCODER_PROVIDER?.trim().toLowerCase() || "mapbox";
const isGoogleGeocoder = geocoderProvider === "google";
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const mapboxAccessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
const mapboxNames = ["NEXT_PUBLIC_MAPBOX_TOKEN", "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN"];

const statusEntries = [...requiredInDeploy, ...optional].map((key) => ({
  key,
  set: Boolean(process.env[key] && String(process.env[key]).trim().length > 0),
}));

let missing = statusEntries
  .filter((entry) => requiredInDeploy.includes(entry.key) && !entry.set)
  .map((entry) => entry.key);

if (!hasNextAuthSecret && !hasAuthSecret) {
  missing.push("AUTH_SECRET|NEXTAUTH_SECRET");
}

if (isGoogleGeocoder && (!googleMapsApiKey || String(googleMapsApiKey).trim().length === 0)) {
  missing.push("GOOGLE_MAPS_API_KEY");
}

if ((mapboxToken !== undefined || mapboxAccessToken !== undefined)
  && (!mapboxToken || String(mapboxToken).trim().length === 0)
  && (!mapboxAccessToken || String(mapboxAccessToken).trim().length === 0)) {
  missing.push("NEXT_PUBLIC_MAPBOX_TOKEN|NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN");
}

const mapboxEnabled = mapboxToken !== undefined || mapboxAccessToken !== undefined;
const mapboxSummary = mapboxNames
  .map((key) => `${key}=${Boolean(process.env[key] && String(process.env[key]).trim().length > 0)}`)
  .join(" ");
const summary = statusEntries.map(({ key, set }) => `${key}=${set}`).join(" ");

console.log(`[check-env] mode=${mode} geocoder=${geocoderProvider} ${summary}`);
if (isGoogleGeocoder) {
  console.log(`[check-env] google GOOGLE_MAPS_API_KEY=${Boolean(googleMapsApiKey && String(googleMapsApiKey).trim().length > 0)}`);
}
if (mapboxEnabled) {
  console.log(`[check-env] mapbox ${mapboxSummary}`);
}

if (missing.length) {
  console.error(`[check-env] Missing required env vars for deploy context: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("[check-env] OK");
