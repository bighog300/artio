import { spawnSync } from "node:child_process";

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
  const fromHeader = parseSections(statusOutput, [
    /Following migration(?:s)? have failed:/i,
    /The following migration(?:s)? have failed:/i,
    /Following failed migration(?:s)?:/i,
  ]);
  const fromErrorLine = extractMigrationNames(
    statusOutput,
    /failed migration(?:\(s\))?(?::|\s+)/i,
  );

  return Array.from(new Set([...fromHeader, ...fromErrorLine]));
}

function parsePendingMigrations(statusOutput: string): string[] {
  const standardPending = parseSections(statusOutput, [
    /(?:The\s+)?following migration(?:s)? have not yet been applied:/i,
    /The following migration(?:s)? are pending:/i,
  ]);
  const divergentPending = parseSections(statusOutput, [
    /The migration(?:s)? (?:from the database )?have not yet been applied:/i,
  ]);

  return Array.from(new Set([...standardPending, ...divergentPending]));
}

function parseSections(statusOutput: string, headerPatterns: RegExp[]): string[] {
  const lines = statusOutput.split(/\r?\n/);
  const migrations = new Set<string>();
  let collecting = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!collecting && headerPatterns.some((pattern) => pattern.test(trimmed))) {
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
  const dbMigrationsMissingLocally = parseSections(statusOutput, [
    /The migrations? from the database are not found locally(?: in prisma\/migrations)?:/i,
    /The migration from the database is not found locally(?: in prisma\/migrations)?:/i,
    /The following migrations? exist in the database but not in the local migrations directory:/i,
  ]);
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
<<<<<<< Updated upstream
    upToDate: /Database is up to date/i.test(statusOutput),
    connectivityError:
      /P1001/i.test(statusOutput) ||
      /Can't reach database server/i.test(statusOutput),
    configurationError:
      /Missing required env var/i.test(statusOutput) ||
      /Environment variable not found/i.test(statusOutput) ||
      /P1012/i.test(statusOutput) ||
      /P1013/i.test(statusOutput),
=======
    upToDate: /Database(?: schema)? is up to date/i.test(statusOutput),
>>>>>>> Stashed changes
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
    throw new Error(
      "[prisma-safe-deploy] [status] Divergent migration history detected. " +
        `lastCommonMigration=${status.lastCommonMigration ?? "(unknown)"} ` +
        `pendingLocal=${status.pendingMigrations.length > 0 ? status.pendingMigrations.join(", ") : "(none)"} ` +
        `dbMissingLocally=${status.dbMigrationsMissingLocally.length > 0 ? status.dbMigrationsMissingLocally.join(", ") : "(none)"}. ` +
        "Deploy is blocked until histories are reconciled manually.",
    );
  } else if (recognizedStateCount === 0) {
    throw new Error(
      "[prisma-safe-deploy] [status] Unknown/unparseable `prisma migrate status` output. " +
        "Refusing to run deploy automatically. Inspect command output and update parser if needed.",
    );
  }

  if (status.failedDetected) {
    if (status.failedMigrations.length === 0) {
      throw new Error(
        "[prisma-safe-deploy] Failed migration state detected but migration name could not be parsed from Prisma output. " +
          "Run `pnpm prisma migrate status` and inspect `_prisma_migrations` before rerunning.",
      );
    }

    throw new Error(
      `[prisma-safe-deploy] Failed migration(s) detected: ${status.failedMigrations.join(", ")}. ` +
        "Do not auto-resolve. Recover the failed row manually with `pnpm prisma migrate resolve` only after auditing DB state.",
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
