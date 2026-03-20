import { spawnSync } from "node:child_process";

const RESOLVABLE_AS_ROLLED_BACK = new Set([
  "20260706120000_unified_content_status",
  "20261206110000_add_region_id_to_discovery_job",
  "20260320120000_per_entity_ingest_prompts",
]);

const RESOLVABLE_AS_APPLIED = new Set(["20261203105000_enrichment_provenance"]);

const ALWAYS_RESOLVE_AS_ROLLED_BACK = new Set([
  "20260320120000_per_entity_ingest_prompts",
]);

const RESOLVABLE_FAILED_MIGRATIONS = new Set([
  ...RESOLVABLE_AS_ROLLED_BACK,
  ...RESOLVABLE_AS_APPLIED,
]);
const DEPLOY_MAX_ATTEMPTS = 2;
const DEPLOY_RETRY_DELAY_MS = 2_000;

type PrismaResult = {
  status: number;
  output: string;
};

type StatusSummary = {
  failedMigrations: string[];
  pendingMigrations: string[];
  failedDetected: boolean;
  pendingDetected: boolean;
  divergentHistory: boolean;
  uninitializedDetected: boolean;
  upToDate: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  if (args[0] === "migrate" && args[1] === "deploy" && env.DIRECT_URL) {
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
    throw new Error(
      `[prisma-safe-deploy] Command failed with exit code ${result.status}: pnpm prisma ${args.join(" ")}`,
    );
  }

  return {
    status: result.status ?? 1,
    output: `${stdout}\n${stderr}`,
  };
}

function parseFailedMigrations(statusOutput: string): string[] {
  return parseMigrationList(statusOutput, /Following migration have failed:/i);
}

function parsePendingMigrations(statusOutput: string): string[] {
  const standardPending = parseMigrationList(
    statusOutput,
    /Following migrations have not yet been applied:/i,
  );
  const divergentPending = parseMigrationList(
    statusOutput,
    /The migration have not yet been applied:/i,
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
    failedDetected: /Following migration have failed:/i.test(statusOutput),
    pendingDetected:
      /Following migrations have not yet been applied:/i.test(statusOutput) ||
      (divergentHistory && pendingMigrations.length > 0),
    divergentHistory,
    uninitializedDetected:
      /relation\s+"_prisma_migrations"\s+does not exist/i.test(statusOutput) ||
      /The table `?_prisma_migrations`? does not exist/i.test(statusOutput),
    upToDate: /Database is up to date/i.test(statusOutput),
  };
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
      console.error(
        `[prisma-safe-deploy] [deploy] migrate deploy attempt ${attempt}/${DEPLOY_MAX_ATTEMPTS} failed: ${lastError.message}`,
      );

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
  console.log(
    "[prisma-safe-deploy] Starting safe Prisma migration deploy flow.",
  );

  const statusResult = runPrisma(["migrate", "status"], {
    allowFailure: true,
    step: "Checking migration status",
  });

  const status = parseStatusSummary(statusResult.output);

  for (const migration of ALWAYS_RESOLVE_AS_ROLLED_BACK) {
    const result = runPrisma(
      ["migrate", "resolve", "--rolled-back", migration],
      {
        allowFailure: true,
        step: `Pre-resolving superseded migration ${migration}`,
      },
    );
    if (result.status !== 0 && !result.output.includes("P3008")) {
      console.warn(
        `[prisma-safe-deploy] [resolve] Could not pre-resolve ${migration} — may not exist in DB, continuing.`,
      );
    }
  }

  console.log(
    `[prisma-safe-deploy] [status] pending=${status.pendingMigrations.length} failed=${status.failedMigrations.length} divergentHistory=${status.divergentHistory} uninitialized=${status.uninitializedDetected} upToDate=${status.upToDate}`,
  );

  const recognizedStateCount =
    Number(status.failedDetected) +
    Number(status.pendingDetected) +
    Number(status.uninitializedDetected) +
    Number(status.upToDate) +
    Number(status.divergentHistory);

  if (recognizedStateCount === 0) {
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

    if (
      unknownFailedMigrations.length > 0 ||
      status.failedMigrations.length === 0
    ) {
      throw new Error(
        `[prisma-safe-deploy] Found unsupported failed migration(s): [${
          status.failedMigrations.join(", ") || "unknown"
        }]. Only [${[...RESOLVABLE_FAILED_MIGRATIONS].join(", ")}] can be auto-resolved.`,
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
    status.uninitializedDetected ||
    status.divergentHistory
  ) {
    if (status.uninitializedDetected) {
      console.log(
        "[prisma-safe-deploy] [status] Migration table missing; treating database as uninitialized.",
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
