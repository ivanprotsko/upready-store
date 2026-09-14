import fs from "node:fs";
import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";

/**
 * t11-seo-redirects step 5 — imports the old-shop URL table for tenant
 * `cherkashino` from the 2026-09-12 migration's own registry
 * (`artifacts/docs/2026-09-12-cherkashina-migration/02-mapping-registry.json`
 * in the `feat/cherkashina-tenant` worktree): 38 products + 9 categories = 47
 * rows, `kind: "product"` / `kind: "category"` with `source_url`/`target_url`.
 *
 * The source is olavka.ru's own Astro mirror, whose router doubled the locale
 * segment (`/ru/ru/products/<handle>`) — handled explicitly here by taking
 * the PATH of `source_url` as written, not by a regex that happens to strip
 * one `/ru/`: a source row missing that shape is reported, never guessed at.
 * The target path is this platform's own `/<locale>/<kind>/<handle>`, taken
 * from `target_url` the same way.
 *
 * Idempotent: a row whose `from_path` already exists for this tenant is
 * counted as skipped, not re-created and not overwritten — a second run
 * against the same registry reports 0 written.
 *
 *   npx medusa exec ./src/scripts/import-cherkashino-redirects.ts <registry.json> [dry-run]
 */
type RegistryRow = {
  kind: string;
  source_url?: string;
  target_url?: string;
  source_handle?: string;
  target_handle?: string;
};

type Registry = { tenant?: { handle?: string }; rows: RegistryRow[] };

const pathOf = (url: string): string | null => {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
};

export default async function importCherkashinoRedirects({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

  const dryRun = args.includes("dry-run") || args.includes("--dry-run");
  const registryPath = args.find((a) => !a.includes("dry-run"));

  if (!registryPath) {
    logger.error(
      "import-cherkashino-redirects: pass the path to 02-mapping-registry.json as the first argument",
    );
    process.exitCode = 1;
    return;
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as Registry;
  const tenantHandle = registry.tenant?.handle ?? "cherkashino";

  const [tenant] = await tenantModuleService.listTenants({ handle: tenantHandle });

  if (!tenant) {
    logger.error(`import-cherkashino-redirects: no tenant with handle "${tenantHandle}"`);
    process.exitCode = 1;
    return;
  }

  const existing = await tenantModuleService.listTenantRedirects({ tenant_id: tenant.id });
  const existingFromPaths = new Set(existing.map((row) => row.from_path));

  const rows = registry.rows.filter((row) => row.kind === "product" || row.kind === "category");

  let written = 0;
  let skipped = 0;
  const unmapped: string[] = [];

  for (const row of rows) {
    if (!row.source_url || !row.target_url) {
      unmapped.push(`${row.kind} ${row.source_handle ?? row.target_handle ?? "?"}: no source_url/target_url`);
      continue;
    }

    const fromPath = pathOf(row.source_url);
    const toPath = pathOf(row.target_url);

    if (!fromPath || !toPath) {
      unmapped.push(`${row.kind} ${row.source_handle ?? "?"}: could not parse ${row.source_url} -> ${row.target_url}`);
      continue;
    }

    if (existingFromPaths.has(fromPath)) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      logger.info(`import-cherkashino-redirects: [dry-run] would write ${fromPath} -> ${toPath}`);
      written += 1;
      continue;
    }

    await tenantModuleService.createTenantRedirects({
      tenant_id: tenant.id,
      from_path: fromPath,
      to_path: toPath,
      status_code: 301,
    });
    existingFromPaths.add(fromPath);
    written += 1;
  }

  logger.info(
    `import-cherkashino-redirects: ${written} written, ${skipped} already present, ${unmapped.length} unmapped (tenant ${tenant.handle}, dry_run=${dryRun})`,
  );

  for (const line of unmapped) {
    logger.warn(`import-cherkashino-redirects: unmapped — ${line}`);
  }
}
