#!/usr/bin/env node

import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const targets = [".next", ".vercel/output", "/vercel/output"];

function kb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function dirSize(pathname) {
  const full = resolve(root, pathname);
  if (!existsSync(full)) return null;
  const result = spawnSync("bash", ["-lc", `du -sb ${JSON.stringify(full)} | cut -f1`], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const bytes = Number(result.stdout.trim());
  if (Number.isNaN(bytes)) return null;
  return bytes;
}

function largestFiles(pathname, count = 10) {
  const full = resolve(root, pathname);
  if (!existsSync(full)) return [];
  const cmd = `find ${JSON.stringify(full)} -type f -printf '%s %p\\n' | sort -nr | head -n ${count}`;
  const result = spawnSync("bash", ["-lc", cmd], { encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const space = line.indexOf(" ");
      const bytes = Number(line.slice(0, space));
      const fullPath = line.slice(space + 1);
      return { bytes, path: relative(root, fullPath) };
    });
}

console.log("[build-size] Summary (post-cleanup)");
for (const target of targets) {
  const size = dirSize(target);
  if (size === null) {
    console.log(`[build-size] ${target}: not found`);
    continue;
  }
  console.log(`[build-size] ${target}: ${kb(size)} (${size} bytes)`);
  const top = largestFiles(target, 8);
  for (const item of top) {
    console.log(`[build-size]   ${kb(item.bytes)}  ${item.path}`);
  }
}
