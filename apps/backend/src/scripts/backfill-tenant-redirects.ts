import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import tenantProductLink from "../links/tenant-product";
import tenantProductCategoryLink from "../links/tenant-product-category";
import { TENANT_MODULE } from "../modules/tenant";
import { storeDefaultLocale } from "../shipping-tariffs/default-method-names";
import type TenantModuleService from "../modules/tenant/service";
import {
  deriveMigratedRedirects,
  readSeededMarker,
  SEEDED_METADATA_KEY,
  type MigratedResource,
} from "../tenant-redirects/migrated-redirects";
import {
  deriveMigratedPageRedirects,
  readPageSeededMarker,
  PAGE_SEEDED_METADATA_KEY,
  type TenantPageRow,
} from "../tenant-redirects/migrated-pages";

/**
 * Writes the 301 rows a migrated catalogue implies, for every tenant that has
 * one, from the `migrated_from`/`source_url` metadata the importer already
 * left on each product and category (`src/tenant-redirects/migrated-redirects.ts`
 * derives them; this script only reads, writes and reports).
 *
 * b08-seo-storefront adds the shop's CONTENT pages to the same run. They carry
 * no metadata of their own, so their old addresses come from the checked-in
 * table in `src/tenant-redirects/migrated-pages.ts`, and a row is written only
 * when the shop actually has that page published — an address whose page does
 * not exist yet is logged as unmapped and starts answering by itself on the
 * first deploy after someone creates it. The two halves carry separate markers
 * (`redirects_seeded_from` for the catalogue, `page_redirects_seeded_from` for
 * the pages), because the catalogue was stamped by b02 long before a single
 * page row existed.
 *
 * The backend runs it on every boot (`docker-entrypoint.sh` step 6), so an
 * ordinary deploy makes the old addresses of an imported shop answer 301
 * without anyone remembering to run anything — the gap
 * `artifacts/q03-gap-recheck/gap-recheck.md` §4 measured: rows on the stand,
 * zero rows live, every old address a 404.
 *
 * Idempotent in two layers. A `from_path` this tenant already has is skipped,
 * so a second run writes nothing; and after a successful run the tenant is
 * stamped with `metadata.redirects_seeded_from = { "<source>": "<ISO>" }`, so
 * a row the OWNER deleted in the panel stays deleted instead of coming back
 * on the next deploy. A catalogue imported after that stamp is still picked up
 * (its rows are newer than the marker), and `--force` ignores the stamp
 * altogether.
 *
 *   npx medusa exec ./src/scripts/backfill-tenant-redirects.ts
 *   npx medusa exec ./src/scripts/backfill-tenant-redirects.ts dry-run
 *   npx medusa exec ./src/scripts/backfill-tenant-redirects.ts tenant=cherkashino force
 */
/** Just the slice of the framework's Query this script uses. */
type GraphQuery = {
  graph: (input: {
    entity: string;
    fields: string[];
    filters?: Record<string, unknown>;
  }) => Promise<{ data: Record<string, unknown>[] }>;
};

export default async function backfillTenantRedirects({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

  // Bare words, no leading dashes: `medusa exec` parses its OWN argv first and
  // answers «Unknown arguments: dry-run» to a `--dry-run` meant for the script
  // (measured 2026-09-15, medusa CLI 2.19) — the same shape
  // `import-cherkashino-redirects.ts` already takes.
  const argv = args ?? [];
  const dryRun = argv.includes("dry-run");
  const force = argv.includes("force");
  const onlyHandle = argv.find((a) => a.startsWith("tenant="))?.slice("tenant=".length) ?? null;

  const { data: tenants } = await query.graph({
    entity: "tenant",
    fields: ["id", "handle", "metadata"],
    ...(onlyHandle ? { filters: { handle: [onlyHandle] } } : {}),
  });

  if (!tenants.length) {
    logger.info(
      `backfill-tenant-redirects: no tenants${onlyHandle ? ` with handle "${onlyHandle}"` : ""}, nothing to do`,
    );
    return;
  }

  let writtenTotal = 0;
  let skippedTotal = 0;
  let touchedTenants = 0;

  for (const tenant of tenants as { id: string; handle: string; metadata?: unknown }[]) {
    const resources = await migratedResourcesOf(query, tenant.id);
    if (!resources.length) {
      continue;
    }

    // An ABSENT locale-settings row is "nothing saved", not "this shop is in
    // English": the live Cherkashina tenant has none and answers on `/ru`
    // (measured 2026-09-15). `getTenantEnabledLocales`'s `["en"]` fallback is
    // right where a rename must mint a row per language and wrong here, so
    // this script passes the absence through as `null` and lets `targetLocale`
    // keep the address's own locale.
    const [settings] = await tenantModuleService.listTenantLocaleSettings({ tenant_id: tenant.id });
    const saved = (settings?.enabled_locales as unknown as string[] | undefined) ?? null;
    const enabledLocales = saved
      ? saved.filter((locale): locale is string => typeof locale === "string" && locale.length > 0)
      : null;
    const defaultLocale =
      (settings?.default_locale as string | undefined) ?? storeDefaultLocale();

    const seededAt = force ? {} : readSeededMarker(tenant.metadata);
    const { rows: catalogueRows, sources, unmapped } = deriveMigratedRedirects(resources, {
      enabledLocales: enabledLocales?.length ? enabledLocales : null,
      defaultLocale,
      seededAt,
    });

    // b08-seo-storefront: the shop's CONTENT pages carry no migration metadata
    // of their own (`tenant_page` has no such column), so their old addresses
    // come from the table in `tenant-redirects/migrated-pages.ts` — but only
    // for a source this tenant's catalogue is actually stamped with, and only
    // for a page the shop really has.
    const migrationSources = [
      ...new Set(
        resources
          .map((resource) => (resource.metadata ?? {}).migrated_from)
          .filter((source): source is string => typeof source === "string" && source.length > 0),
      ),
    ];
    const pages = (await tenantModuleService.listTenantPages({
      tenant_id: tenant.id,
    })) as unknown as TenantPageRow[];
    const pageSeededAt = force ? {} : readPageSeededMarker(tenant.metadata);
    const {
      rows: pageRows,
      sources: pageSources,
      unmapped: pageUnmapped,
    } = deriveMigratedPageRedirects(migrationSources, pages, {
      enabledLocales: enabledLocales?.length ? enabledLocales : null,
      defaultLocale,
      seededAt: pageSeededAt,
    });

    const rows = [...catalogueRows, ...pageRows];

    for (const line of [...unmapped, ...pageUnmapped]) {
      logger.warn(`backfill-tenant-redirects: ${tenant.handle} — unmapped: ${line}`);
    }

    if (!rows.length) {
      continue;
    }

    const existing = await tenantModuleService.listTenantRedirects({ tenant_id: tenant.id });
    const existingFromPaths = new Set(existing.map((row) => row.from_path as string));

    const fresh = rows.filter((row) => !existingFromPaths.has(row.from_path));
    const skipped = rows.length - fresh.length;
    skippedTotal += skipped;

    if (fresh.length && !dryRun) {
      await tenantModuleService.createTenantRedirects(
        fresh.map((row) => ({
          tenant_id: tenant.id,
          from_path: row.from_path,
          to_path: row.to_path,
          status_code: row.status_code,
        })),
      );
    }

    writtenTotal += fresh.length;
    if (fresh.length) touchedTenants += 1;

    const freshPages = fresh.filter((row) =>
      pageRows.some((pageRow) => pageRow.from_path === row.from_path),
    );

    logger.info(
      `backfill-tenant-redirects: ${tenant.handle} — ${fresh.length} written ` +
        `(${fresh.length - freshPages.length} catalogue, ${freshPages.length} pages), ${skipped} already present` +
        `, ${unmapped.length + pageUnmapped.length} unmapped ` +
        `(sources: ${[...new Set([...sources, ...pageSources])].join(", ") || "—"}, dry_run=${dryRun})`,
    );

    if (!dryRun && (sources.length || pageSources.length)) {
      const stampedAt = new Date().toISOString();
      const marker = { ...readSeededMarker(tenant.metadata) };
      for (const source of sources) {
        marker[source] = stampedAt;
      }
      const pageMarker = { ...readPageSeededMarker(tenant.metadata) };
      for (const source of pageSources) {
        pageMarker[source] = stampedAt;
      }
      await tenantModuleService.updateTenants({
        id: tenant.id,
        metadata: {
          ...((tenant.metadata as Record<string, unknown> | null) ?? {}),
          [SEEDED_METADATA_KEY]: marker,
          [PAGE_SEEDED_METADATA_KEY]: pageMarker,
        },
      });
    }
  }

  logger.info(
    `backfill-tenant-redirects: done — ${writtenTotal} written across ${touchedTenants} tenant(s), ` +
      `${skippedTotal} already present, ${tenants.length} tenant(s) examined (dry_run=${dryRun})`,
  );
}

/**
 * This tenant's products and categories, read through the ownership links
 * (`tenant_product`, `tenant_product_category`) the way every `/tenants/*`
 * route scopes: a neighbouring shop's rows can never enter this tenant's
 * redirect table, whatever a shared handle or a shared source might suggest.
 */
const migratedResourcesOf = async (
  query: GraphQuery,
  tenantId: string,
): Promise<MigratedResource[]> => {
  const out: MigratedResource[] = [];

  const { data: productLinks } = await query.graph({
    entity: tenantProductLink.entryPoint,
    fields: ["product_id"],
    filters: { tenant_id: tenantId },
  });
  const productIds = productLinks
    .map((link) => link?.product_id as string | undefined)
    .filter((id): id is string => Boolean(id));

  if (productIds.length) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "metadata", "created_at"],
      filters: { id: productIds },
    });
    for (const product of products) {
      out.push({
        kind: "products",
        handle: product.handle as string,
        created_at: product.created_at as string | Date | null,
        metadata: (product.metadata ?? null) as Record<string, unknown> | null,
      });
    }
  }

  const { data: categoryLinks } = await query.graph({
    entity: tenantProductCategoryLink.entryPoint,
    fields: ["product_category_id"],
    filters: { tenant_id: tenantId },
  });
  const categoryIds = categoryLinks
    .map((link) => link?.product_category_id as string | undefined)
    .filter((id): id is string => Boolean(id));

  if (categoryIds.length) {
    const { data: categories } = await query.graph({
      entity: "product_category",
      fields: ["id", "handle", "metadata", "created_at"],
      filters: { id: categoryIds },
    });
    for (const category of categories) {
      out.push({
        kind: "categories",
        handle: category.handle as string,
        created_at: category.created_at as string | Date | null,
        metadata: (category.metadata ?? null) as Record<string, unknown> | null,
      });
    }
  }

  return out;
};

