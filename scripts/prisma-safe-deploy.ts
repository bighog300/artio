import { spawnSync } from "node:child_process";

const TARGET_FAILED_MIGRATION = "20260706120000_unified_content_status";
const DEPLOY_MAX_ATTEMPTS = 2;
const DEPLOY_RETRY_DELAY_MS = 2_000;

type PrismaResult = {
  status: number;
  output: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function runPrisma(
  args: string[],
  options: { allowFailure?: boolean; step: string } = { step: "Prisma command" },
): PrismaResult {
  console.log(`\n[prisma-safe-deploy] [step=${options.step}] pnpm prisma ${args.join(" ")}`);

  const result = spawnSync("pnpm", ["prisma", ...args], {
    env: process.env,
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
  const lines = statusOutput.split(/\r?\n/);
  const failedMigrations = new Set<string>();
  let collecting = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!collecting && /Following migration have failed:/i.test(trimmed)) {
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
      failedMigrations.add(migrationMatch[0]);
      continue;
    }

    if (!/^[-*]/.test(trimmed) && !/^\d{14}_/.test(trimmed)) {
      break;
    }
  }

  return Array.from(failedMigrations);
}

function hasFailureSignature(statusOutput: string): boolean {
  return /Following migration have failed:|P3009|failed migration|previously failed/i.test(statusOutput);
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
      console.log(`[prisma-safe-deploy] [deploy] migrate deploy succeeded on attempt ${attempt}.`);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[prisma-safe-deploy] [deploy] migrate deploy attempt ${attempt}/${DEPLOY_MAX_ATTEMPTS} failed: ${lastError.message}`,
      );

      if (attempt < DEPLOY_MAX_ATTEMPTS) {
        console.log(`[prisma-safe-deploy] [deploy] Retrying in ${DEPLOY_RETRY_DELAY_MS}ms...`);
        await sleep(DEPLOY_RETRY_DELAY_MS);
      }
    }
  }

  throw lastError ?? new Error("migrate deploy failed after retries");
}

async function main() {
  console.log("[prisma-safe-deploy] Starting safe Prisma migration deploy flow.");

  const statusResult = runPrisma(["migrate", "status"], {
    allowFailure: true,
    step: "Checking migration status",
  });

  const failedMigrations = parseFailedMigrations(statusResult.output);
  const migrationFailureDetected = hasFailureSignature(statusResult.output);

  console.log(
    `[prisma-safe-deploy] [status] exit_code=${statusResult.status} failure_detected=${migrationFailureDetected} failed_migrations=${failedMigrations.length > 0 ? failedMigrations.join(",") : "none"}`,
  );

  if (!migrationFailureDetected && statusResult.status !== 0) {
    throw new Error(
      `[prisma-safe-deploy] prisma migrate status failed without a known migration failure signature. ` +
        `Exit code: ${statusResult.status}. Refusing to continue deploy.`,
    );
  }

  if (migrationFailureDetected) {
    const unknownFailedMigrations = failedMigrations.filter(
      (migrationName) => migrationName !== TARGET_FAILED_MIGRATION,
    );

    if (unknownFailedMigrations.length > 0 || failedMigrations.length === 0) {
      throw new Error(
        `[prisma-safe-deploy] Found unsupported failed migration(s): [${
          failedMigrations.join(", ") || "unknown"
        }]. Only '${TARGET_FAILED_MIGRATION}' can be auto-resolved.`,
      );
    }

    console.log(
      `[prisma-safe-deploy] [resolve] Auto-resolving known failed migration '${TARGET_FAILED_MIGRATION}' as rolled back.`,
    );

    runPrisma(["migrate", "resolve", "--rolled-back", TARGET_FAILED_MIGRATION], {
      step: `Resolving failed migration ${TARGET_FAILED_MIGRATION}`,
    });

    console.log(
      `[prisma-safe-deploy] [resolve] resolved_migrations=${TARGET_FAILED_MIGRATION} status=completed`,
    );
  } else {
    console.log("[prisma-safe-deploy] [resolve] No failed migration detected. Resolve skipped.");
  }

  await runDeployWithRetry();

  runPrisma(["migrate", "status"], {
    step: "Verifying migration status after deploy",
  });

  console.log("[prisma-safe-deploy] [final] ✅ Safe deploy completed successfully.");
}

main().catch((error) => {
  console.error("[prisma-safe-deploy] [final] ❌ Safe deploy failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
