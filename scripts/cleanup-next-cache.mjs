#!/usr/bin/env node

import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const cacheDir = resolve(process.cwd(), ".next", "cache");

if (!existsSync(cacheDir)) {
  console.log("[cleanup-next-cache] .next/cache not found; skipping");
  process.exit(0);
}

rmSync(cacheDir, { recursive: true, force: true });
console.log("[cleanup-next-cache] removed .next/cache");
