import { gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import exportTenantWorkflow from "../workflows/tenant/export-tenant";

/**
 * `medusa exec` entry point for a tenant export, container access without
 * HTTP credentials (`docs/multitenancy/admin-tenants-api-contract.md` §6).
 *
 *   npx medusa exec ./src/scripts/tenant-export.ts <handle> <outDir>
 *
 * Writes `<outDir>/tenant-<handle>-<YYYY-MM-DD>.json.gz` and prints a counts
 * table, the compressed and uncompressed byte size, and the elapsed time.
 * Read-only: `exportTenantWorkflow` never writes a row, so this is safe to
 * run against a live stand.
 */
export default async function tenantExport({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const [handle, outDirArg] = args;
  if (!handle) {
    logger.error(
      "tenant-export: usage: npx medusa exec ./src/scripts/tenant-export.ts <handle> <outDir>",
    );
    process.exitCode = 1;
    return;
  }

  const outDir = resolve(outDirArg || ".medusa/exports");
  mkdirSync(outDir, { recursive: true });

  const startedAt = Date.now();

  const { result } = await exportTenantWorkflow(container).run({
    input: { handle },
  });

  const json = JSON.stringify(result.bundle);
  const uncompressedBytes = Buffer.byteLength(json, "utf8");
  const gz = gzipSync(Buffer.from(json, "utf8"));

  const dateStamp = new Date().toISOString().slice(0, 10);
  const outFile = resolve(outDir, `tenant-${handle}-${dateStamp}.json.gz`);
  writeFileSync(outFile, gz);

  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);

  const counts = result.manifest.counts;
  const countLines = Object.entries(counts)
    .map(([name, count]) => `  ${name.padEnd(16)} ${String(count).padStart(6)}`)
    .join("\n");

  logger.info(
    [
      `tenant-export: ${handle} -> ${outFile}`,
      "counts:",
      countLines,
      `bytes (uncompressed): ${uncompressedBytes}`,
      `bytes (gzip):         ${gz.length}`,
      `elapsed:              ${elapsedSeconds}s`,
    ].join("\n"),
  );
}
