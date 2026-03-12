#!/usr/bin/env node

function parseMode(argv) {
  const modeArg = argv.find((entry) => entry.startsWith("--mode="));
  if (!modeArg) return "auto";
  return modeArg.split("=")[1] || "auto";
}

const mode = parseMode(process.argv.slice(2));
const isDeployContext = process.env.VERCEL === "1" || process.env.CI === "true";
const shouldEnforce = mode === "vercel-build" || mode === "deploy" || (mode === "auto" && isDeployContext);

if (!shouldEnforce) {
  console.log("[check-env] non-deploy context detected; skipping strict checks");
  process.exit(0);
}

const requiredInDeploy = ["AUTH_SECRET", "DATABASE_URL", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
const optional = ["DIRECT_URL"];
requiredInDeploy.push("CRON_SECRET");

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
