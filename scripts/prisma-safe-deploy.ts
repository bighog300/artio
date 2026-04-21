import { spawnSync } from "node:child_process";

const RESOLVABLE_AS_ROLLED_BACK = new Set([
  "20260706120000_unified_content_status",
  "20261206110000_add_region_id_to_discovery_job",
  "20260320120000_per_entity_ingest_prompts",
  // Renamed to 20261201110000 to fix ordering
  "20260325130000_venue_claim_invites_campaign_type",
  // Renamed from 20260326 to fix ordering (after ArtworkInquiry)
  "20260326120000_add_artwork_inquiry_read_at",
  // May be recorded as failed on first apply
  "20270403120000_add_artwork_inquiry_read_at",
  // Old name before timestamp dedup rename
  "20260326120000_add_artist_cv_entries",
  // May be recorded as failed on first apply
  "20260327120000_add_artist_cv_entries",
  // Failed on first apply due to ADD CONSTRAINT IF NOT
  // EXISTS syntax error — fixed in subsequent commit
  "20270409120000_discovery_template_suggestion",
  // FK on IngestRun before IngestRun existed
  "20260406130000_gallery_first_ingestion",
  "20270420120000_sprint1_core_user_loop",
]);

const RESOLVABLE_AS_APPLIED = new Set([
  "20261203105000_enrichment_provenance",
  // Staging-only ghost: already successfully applied in staging DB; --rolled-back rejected with P3012
  "20260411200000_add_artwork_matched_artist",
  // Staging-only ghost: already successfully applied in staging DB; --rolled-back rejected with P3012
  "20260411210000_add_directory_pipeline_mode",
  // Old name before rename attempt; successfully applied in staging DB
  "20270420120000_add_artist_collections_and_profile_fields",
]);

const RESOLVABLE_FAILED_MIGRATIONS = new Set([
  ...RESOLVABLE_AS_ROLLED_BACK,
  ...RESOLVABLE_AS_APPLIED,
]);
const DEPLOY_MAX_ATTEMPTS = 3;
const DEPLOY_RETRY_DELAY_MS = 8_000;
const NEON_WARMUP_MAX_ATTEMPTS = 8;
const NEON_WARMUP_RETRY_DELAY_MS = 5_000;

type PrismaResult = {
  status: number;
  output: string;
};

class PrismaCommandError extends Error {
  readonly output: string;
  readonly status: number;
  readonly args: string[];

  constructor(args: string[], status: number, output: string) {
    super(
      `[prisma-safe-deploy] Command failed with exit code ${status}: pnpm prisma ${args.join(" ")}`,
    );
    this.name = "PrismaCommandError";
    this.args = args;
    this.status = status;
    this.output = output;
  }
}


function requireEnv(name: string) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`[prisma-safe-deploy] Missing required env var: ${name}`);
  }
}

type StatusSummary = {
  failedMigrations: string[];
  pendingMigrations: string[];
  dbMigrationsMissingLocally: string[];
  lastCommonMigration: string | null;
  failedDetected: boolean;
  pendingDetected: boolean;
  divergentHistory: boolean;
  uninitializedDetected: boolean;
  upToDate: boolean;
  connectivityError: boolean;
  configurationError: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function warmUpConnection(): Promise<void> {
  const isNeon =
    (process.env.DATABASE_URL ?? "").includes("neon.tech") ||
    (process.env.DIRECT_URL ?? "").includes("neon.tech");

  if (!isNeon) return;

  console.log(
    "[prisma-safe-deploy] Neon endpoint detected — warming up connection before deploy.",
  );

  for (let attempt = 1; attempt <= NEON_WARMUP_MAX_ATTEMPTS; attempt += 1) {
    const result = runPrisma(["migrate", "status"], {
      allowFailure: true,
      step: `Neon warm-up probe (attempt ${attempt}/${NEON_WARMUP_MAX_ATTEMPTS})`,
    });

    if (result.status === 0) {
      console.log(
        `[prisma-safe-deploy] Connection warm-up succeeded on attempt ${attempt}.`,
      );
      return;
    }

    if (result.output.includes("P1001")) {
      console.log(
        `[prisma-safe-deploy] Branch still cold (attempt ${attempt}/${NEON_WARMUP_MAX_ATTEMPTS}), retrying in ${NEON_WARMUP_RETRY_DELAY_MS / 1000}s...`,
      );
      if (attempt < NEON_WARMUP_MAX_ATTEMPTS) {
        await sleep(NEON_WARMUP_RETRY_DELAY_MS);
      }
    } else {
      console.log(
        "[prisma-safe-deploy] Warm-up probe returned non-connectivity error, proceeding.",
      );
      return;
    }
  }

  console.warn(
    "[prisma-safe-deploy] Could not confirm warm connection after max attempts — proceeding anyway.",
  );
}

function runPrisma(
  args: string[],
  options: { allowFailure?: boolean; step: string } = {
    step: "Prisma command",
  },
): PrismaResult {
  console.log(
    `\n[prisma-safe-deploy] [step=${options.step}] pnpm prisma ${args.join(" ")}`,
  );

  const env = { ...process.env };
  if (args[0] === "migrate" && env.DIRECT_URL) {
    // Always use the direct (non-pooler) URL for all migrate subcommands.
    // Using the pooler URL for `migrate status` or `migrate resolve` causes
    // PgBouncer to hold the advisory lock on an idle connection, preventing
    // `migrate deploy` from acquiring it on the direct connection.
    env.DATABASE_URL = env.DIRECT_URL;
  }

  const result = spawnSync("pnpm", ["prisma", ...args], {
    env,
    encoding: "utf8",
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  if (stdout.trim().length > 0) {
    console.log(stdout.trimEnd());
  }

  if (stderr.trim().length > 0) {
    console.error(stderr.trimEnd());
  }

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && !options.allowFailure) {
    throw new PrismaCommandError(
      args,
      result.status ?? 1,
      `${stdout}\n${stderr}`,
    );
  }

  return {
    status: result.status ?? 1,
    output: `${stdout}\n${stderr}`,
  };
}

function parseFailedMigrations(statusOutput: string): string[] {
  const fromHeader = parseMigrationList(
    statusOutput,
    /Following migration(?:s)? have failed:/i,
  );
  const fromErrorLine = extractMigrationNames(
    statusOutput,
    /failed migration(?:\(s\))?(?::|\s+)/i,
  );

  return Array.from(new Set([...fromHeader, ...fromErrorLine]));
}

function parsePendingMigrations(statusOutput: string): string[] {
  const standardPending = parseMigrationList(
    statusOutput,
    /(?:The\s+)?following migration(?:s)? have not yet been applied:/i,
  );
  const divergentPending = parseMigrationList(
    statusOutput,
    /The migration(?:s)? (?:from the database )?have not yet been applied:/i,
  );

  return Array.from(new Set([...standardPending, ...divergentPending]));
}

function parseMigrationList(
  statusOutput: string,
  headerPattern: RegExp,
): string[] {
  const lines = statusOutput.split(/\r?\n/);
  const migrations = new Set<string>();
  let collecting = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!collecting && headerPattern.test(trimmed)) {
      collecting = true;
      continue;
    }

    if (!collecting) {
      continue;
    }

    if (trimmed.length === 0) {
      break;
    }

    const migrationMatch = trimmed.match(/\b\d{14}_[a-z0-9_]+\b/i);
    if (migrationMatch) {
      migrations.add(migrationMatch[0]);
      continue;
    }

    if (!/^[-*]/.test(trimmed) && !/^\d{14}_/.test(trimmed)) {
      break;
    }
  }

  return Array.from(migrations);
}

function parseStatusSummary(statusOutput: string): StatusSummary {
  const failedMigrations = parseFailedMigrations(statusOutput);
  const pendingMigrations = parsePendingMigrations(statusOutput);
  const dbMigrationsMissingLocally = parseMigrationList(
    statusOutput,
    /The migrations from the database are not found locally(?: in prisma\/migrations)?:/i,
  );
  const lastCommonMigration = parseLastCommonMigration(statusOutput);
  const divergentHistory =
    /Your local migration history and the migrations table from your database are different/i.test(
      statusOutput,
    ) ||
    /The migrations from the database are not found locally/i.test(
      statusOutput,
    );

  return {
    failedMigrations,
    pendingMigrations,
    dbMigrationsMissingLocally,
    lastCommonMigration,
    failedDetected:
      /Following migration(?:s)? have failed:/i.test(statusOutput) ||
      /P3009/i.test(statusOutput) ||
      /failed migration/i.test(statusOutput),
    pendingDetected:
      /(?:The\s+)?following migration(?:s)? have not yet been applied:/i.test(
        statusOutput,
      ) ||
      /The migration(?:s)? (?:from the database )?have not yet been applied:/i.test(
        statusOutput,
      ) ||
      pendingMigrations.length > 0 ||
      (divergentHistory && pendingMigrations.length > 0),
    divergentHistory,
    uninitializedDetected:
      /relation\s+"_prisma_migrations"\s+does not exist/i.test(statusOutput) ||
      /The table `?_prisma_migrations`? does not exist/i.test(statusOutput),
    upToDate: /Database is up to date/i.test(statusOutput),
    connectivityError:
      /P1001/i.test(statusOutput) ||
      /Can't reach database server/i.test(statusOutput),
    configurationError:
      /Missing required env var/i.test(statusOutput) ||
      /Environment variable not found/i.test(statusOutput) ||
      /P1012/i.test(statusOutput) ||
      /P1013/i.test(statusOutput),
  };
}

function parseLastCommonMigration(statusOutput: string): string | null {
  const match = statusOutput.match(
    /Last common migration:?\s*(\d{14}_[a-z0-9_]+)/i,
  );
  return match?.[1] ?? null;
}

function extractMigrationNames(output: string, anchorPattern: RegExp): string[] {
  const matches = new Set<string>();
  const lines = output.split(/\r?\n/);

  for (const line of lines) {
    if (!anchorPattern.test(line)) continue;
    const migrationMatch = line.match(/\b\d{14}_[a-z0-9_]+\b/i);
    if (migrationMatch) {
      matches.add(migrationMatch[0]);
    }
  }

  return Array.from(matches);
}

function isFailedMigrationState(output: string): boolean {
  return (
    /P3009/i.test(output) ||
    /Following migration(?:s)? have failed:/i.test(output) ||
    /failed migration/i.test(output)
  );
}

async function runDeployWithRetry() {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= DEPLOY_MAX_ATTEMPTS; attempt += 1) {
    try {
      console.log(
        `[prisma-safe-deploy] [deploy] Starting migrate deploy attempt ${attempt}/${DEPLOY_MAX_ATTEMPTS}.`,
      );
      runPrisma(["migrate", "deploy"], {
        step: `Running migrate deploy (attempt ${attempt}/${DEPLOY_MAX_ATTEMPTS})`,
      });
      console.log(
        `[prisma-safe-deploy] [deploy] migrate deploy succeeded on attempt ${attempt}.`,
      );
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorOutput =
        error instanceof PrismaCommandError ? error.output : "";
      console.error(
        `[prisma-safe-deploy] [deploy] migrate deploy attempt ${attempt}/${DEPLOY_MAX_ATTEMPTS} failed: ${lastError.message}`,
      );

      if (isFailedMigrationState(errorOutput)) {
        const failedMigrations = parseFailedMigrations(errorOutput);
        const failedSummary =
          failedMigrations.length > 0 ? failedMigrations.join(", ") : "unknown";
        throw new Error(
          `[prisma-safe-deploy] [deploy] Failed migration state detected (${failedSummary}). ` +
            "Retries stopped. Recover the failed migration record before rerunning deploy.",
        );
      }

      if (attempt < DEPLOY_MAX_ATTEMPTS) {
        console.log(
          `[prisma-safe-deploy] [deploy] Retrying in ${DEPLOY_RETRY_DELAY_MS}ms...`,
        );
        await sleep(DEPLOY_RETRY_DELAY_MS);
      }
    }
  }

  throw lastError ?? new Error("migrate deploy failed after retries");
}

async function main() {
  requireEnv("DATABASE_URL");
  requireEnv("DIRECT_URL");

  console.log(
    "[prisma-safe-deploy] Starting safe Prisma migration deploy flow.",
  );

  await warmUpConnection();

  const statusResult = runPrisma(["migrate", "status"], {
    allowFailure: true,
    step: "Checking migration status",
  });

  if (statusResult.output.includes("P1001")) {
    console.log(
      "[prisma-safe-deploy] [status] P1001 connectivity error in status check — warm-up should have handled this. Proceeding with deploy attempt.",
    );
  }

  const status = parseStatusSummary(statusResult.output);

  console.log(
    `[prisma-safe-deploy] [status] pending=${status.pendingMigrations.length} failed=${status.failedMigrations.length} divergentHistory=${status.divergentHistory} uninitialized=${status.uninitializedDetected} upToDate=${status.upToDate} connectivityError=${status.connectivityError} configurationError=${status.configurationError}`,
  );
  console.log(
    `[prisma-safe-deploy] [status] lastCommonMigration=${
      status.lastCommonMigration ?? "(unknown)"
    }`,
  );
  console.log(
    `[prisma-safe-deploy] [status] pendingMigrations=${
      status.pendingMigrations.length > 0
        ? status.pendingMigrations.join(", ")
        : "(none)"
    }`,
  );
  console.log(
    `[prisma-safe-deploy] [status] dbMigrationsMissingLocally=${
      status.dbMigrationsMissingLocally.length > 0
        ? status.dbMigrationsMissingLocally.join(", ")
        : "(none)"
    }`,
  );
  console.log(
    `[prisma-safe-deploy] [status] failedMigrations=${
      status.failedMigrations.length > 0
        ? status.failedMigrations.join(", ")
        : "(none)"
    }`,
  );

  const recognizedStateCount =
    Number(status.failedDetected) +
    Number(status.pendingDetected) +
    Number(status.uninitializedDetected) +
    Number(status.upToDate) +
    Number(status.divergentHistory) +
    Number(status.connectivityError) +
    Number(status.configurationError);

  if (status.connectivityError) {
    throw new Error(
      "[prisma-safe-deploy] [status] Connectivity failure detected (e.g. P1001). Fix database availability/network and rerun.",
    );
  }

  if (status.configurationError) {
    throw new Error(
      "[prisma-safe-deploy] [status] Configuration failure detected (missing/invalid env). Fix environment variables and rerun.",
    );
  }

  if (status.divergentHistory) {
    const unresolvableMissing = status.dbMigrationsMissingLocally.filter(
      (m) => !RESOLVABLE_FAILED_MIGRATIONS.has(m),
    );

    if (
      unresolvableMissing.length > 0 ||
      status.dbMigrationsMissingLocally.length === 0
    ) {
      throw new Error(
        "[prisma-safe-deploy] [status] Divergent migration history detected. " +
          `lastCommonMigration=${status.lastCommonMigration ?? "(unknown)"} ` +
          `pendingLocal=${status.pendingMigrations.length > 0 ? status.pendingMigrations.join(", ") : "(none)"} ` +
          `dbMissingLocally=${status.dbMigrationsMissingLocally.length > 0 ? status.dbMigrationsMissingLocally.join(", ") : "(none)"}. ` +
          "Deploy is blocked until migration histories are reconciled. " +
          `Unresolvable DB-only migrations: ${unresolvableMissing.length > 0 ? unresolvableMissing.join(", ") : "(none — no DB-only migrations found to resolve)"}`,
      );
    }

    console.log(
      `[prisma-safe-deploy] [resolve] Divergent history caused only by known-resolvable migrations: ${status.dbMigrationsMissingLocally.join(", ")}. Auto-resolving.`,
    );

    for (const migration of status.dbMigrationsMissingLocally) {
      const flag = RESOLVABLE_AS_APPLIED.has(migration)
        ? "--applied"
        : "--rolled-back";
      const result = runPrisma(["migrate", "resolve", flag, migration], {
        allowFailure: true,
        step: `Resolving divergent migration ${migration} as ${flag}`,
      });
      if (result.status !== 0) {
        if (result.output.includes("P3008") || result.output.includes("P3012")) {
          console.warn(
            `[prisma-safe-deploy] [resolve] Migration ${migration} already in target state, skipping.`,
          );
        } else {
          throw new Error(
            `[prisma-safe-deploy] Failed to resolve divergent migration ${migration} (exit ${result.status})`,
          );
        }
      }
    }

    console.log(
      "[prisma-safe-deploy] [resolve] Divergent history resolved. Proceeding with deploy.",
    );
    console.log("[prisma-safe-deploy] [action] running migrate deploy");
    await runDeployWithRetry();
    console.log("[prisma-safe-deploy] [result] migrations applied successfully");
  } else if (recognizedStateCount === 0) {
    console.warn(
      "[prisma-safe-deploy] [status] Unknown prisma migrate status output. Attempting migrate deploy without auto-resolve.",
    );
    await runDeployWithRetry();
    runPrisma(["migrate", "status"], {
      step: "Verifying migration status after deploy",
    });
    console.log(
      "[prisma-safe-deploy] [final] ✅ Safe deploy completed successfully.",
    );
    return;
  }

  if (status.failedDetected) {
    const unknownFailedMigrations = status.failedMigrations.filter(
      (migrationName) => !RESOLVABLE_FAILED_MIGRATIONS.has(migrationName),
    );

    if (status.failedMigrations.length === 0) {
      throw new Error(
        "[prisma-safe-deploy] Failed migration state detected but migration name could not be parsed from Prisma output. " +
          "Run `pnpm prisma migrate status` and inspect `_prisma_migrations` before rerunning.",
      );
    }

    if (unknownFailedMigrations.length > 0) {
      throw new Error(
        `[prisma-safe-deploy] Found unsupported failed migration(s): [${status.failedMigrations.join(", ")}]. ` +
          "Auto-retry disabled. Recover manually after auditing DB state, then rerun deploy. " +
          `Only [${[...RESOLVABLE_FAILED_MIGRATIONS].join(", ")}] can be auto-resolved by this script.`,
      );
    }

    const toResolve = status.failedMigrations.filter((m) =>
      RESOLVABLE_FAILED_MIGRATIONS.has(m),
    );

    console.log(
      `[prisma-safe-deploy] [resolve] Auto-resolving known failed migration(s): ${toResolve.join(", ")}`,
    );

    for (const migration of toResolve) {
      const flag = RESOLVABLE_AS_APPLIED.has(migration)
        ? "--applied"
        : "--rolled-back";
      const result = runPrisma(["migrate", "resolve", flag, migration], {
        allowFailure: true,
        step: `Resolving failed migration ${migration}`,
      });

      if (result.status !== 0) {
        if (result.output.includes("P3008")) {
          console.warn(
            `[prisma-safe-deploy] [resolve] Migration ${migration} already recorded as applied, skipping.`,
          );
        } else {
          throw new Error(
            `[prisma-safe-deploy] Failed to resolve migration ${migration}`,
          );
        }
      }
    }

    console.log(
      `[prisma-safe-deploy] [resolve] resolved_migrations=${toResolve.join(",")} status=completed`,
    );

    console.log("[prisma-safe-deploy] [action] running migrate deploy");
    await runDeployWithRetry();
    console.log(
      "[prisma-safe-deploy] [result] migrations applied successfully",
    );
  } else if (
    status.pendingDetected ||
    status.uninitializedDetected
  ) {
    if (status.uninitializedDetected) {
      console.log(
        "[prisma-safe-deploy] [status] Migration table missing; treating database as uninitialized.",
      );
    }
    if (status.pendingDetected) {
      console.log(
        `[prisma-safe-deploy] [status] Pending migrations detected (${status.pendingMigrations.length}).`,
      );
    }
    console.log(
      "[prisma-safe-deploy] [resolve] No failed migration detected. Resolve skipped.",
    );
    console.log("[prisma-safe-deploy] [action] running migrate deploy");
    await runDeployWithRetry();
    console.log(
      "[prisma-safe-deploy] [result] migrations applied successfully",
    );
  } else if (status.upToDate) {
    console.log(
      "[prisma-safe-deploy] [action] database already up to date; skipping migrate deploy",
    );
    console.log("[prisma-safe-deploy] [result] no migrations needed");
    console.log(
      "[prisma-safe-deploy] [final] ✅ Safe deploy completed successfully.",
    );
    return;
  }

  runPrisma(["migrate", "status"], {
    step: "Verifying migration status after deploy",
  });

  console.log(
    "[prisma-safe-deploy] [final] ✅ Safe deploy completed successfully.",
  );
}

main().catch((error) => {
  console.error("[prisma-safe-deploy] [final] ❌ Safe deploy failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
