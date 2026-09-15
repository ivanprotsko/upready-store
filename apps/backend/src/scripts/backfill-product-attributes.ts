import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { writeFileSync } from "node:fs";
import { coerceValue } from "../api/tenants/product-attributes/helpers";
import { TENANT_MODULE } from "../modules/tenant";
import type { AttributeType } from "../modules/tenant/models/tenant-product-attribute";
import type TenantModuleService from "../modules/tenant/service";
import { ensureChoice, ensureDefaultSchema } from "../product-attributes-fill/apply-default-schema";
import {
  DEFAULT_ATTRIBUTE_PRESET,
  type PresetAttributeKey,
} from "../product-attributes-fill/default-schema";
import { collectProductValues } from "../product-attributes-fill/parse-characteristics";
import { notifyStorefrontRevalidate } from "../storefront-revalidate";

/**
 * Fills the product characteristics of one shop from what its migrated catalog
 * carries in `metadata` (b04-product-attributes).
 *
 * The shop of a real owner arrived from two marketplaces with its
 * characteristics in `metadata.full_characteristics`, a bag no filter can read
 * and no product page can render. t15 gave the platform the schema and the
 * screens; this script is what turns 38 bags into rows of it.
 *
 *   npx medusa exec ./src/scripts/backfill-product-attributes.ts \
 *     cherkashino [dry-run] [overwrite] [report=<path>]
 *
 * The arguments carry no leading dashes because `medusa exec` parses the
 * command line itself and rejects a flag it does not know («Unknown arguments:
 * tenant, dry-run», measured on the Medusa CLI 2.19): what reaches the script
 * is the positional tail. Every argument also has an environment twin
 * (`TENANT_HANDLE`, `DRY_RUN`, `OVERWRITE`, `REPORT_PATH`), which is the form
 * a `docker exec` on the shared engine uses.
 *
 * What it does NOT do, on purpose:
 *
 * - it never overwrites a value that differs from what the catalog says. The
 *   owner types characteristics on the product screen and a nightly re-run
 *   must not undo that, so a differing row is COUNTED and left alone. Pass
 *   `--overwrite` to make the catalog win, which is the import case.
 * - it never invents a value. A name the schema has no place for, and a value
 *   that is not a number where a number is required, both land in the report
 *   with the product they came from.
 * - it writes nothing outside the tenant it was given: products come from the
 *   tenant-product link, not from a sales channel or a category.
 *
 * Running it twice changes nothing the second time, which is what the report's
 * `created` / `unchanged` counters are for.
 */

type Args = {
  tenantHandle: string | null;
  dryRun: boolean;
  overwrite: boolean;
  reportPath: string | null;
};

const parseArgs = (argv: string[]): Args => {
  const args: Args = { tenantHandle: null, dryRun: false, overwrite: false, reportPath: null };

  for (const raw of argv) {
    // A leading `--` never reaches here through `medusa exec`, but a caller
    // who runs the compiled file directly writes one out of habit.
    const arg = raw.replace(/^--/, "");

    if (arg === "dry-run") {
      args.dryRun = true;
    } else if (arg === "overwrite") {
      args.overwrite = true;
    } else if (arg.startsWith("report=")) {
      args.reportPath = arg.slice("report=".length);
    } else if (arg.startsWith("tenant=") || arg.startsWith("handle=")) {
      args.tenantHandle = arg.slice(arg.indexOf("=") + 1);
    } else if (!arg.includes("=") && !args.tenantHandle) {
      args.tenantHandle = arg;
    }
  }

  if (!args.tenantHandle) {
    args.tenantHandle = process.env.TENANT_HANDLE ?? null;
  }
  if (process.env.DRY_RUN === "true") {
    args.dryRun = true;
  }
  if (process.env.OVERWRITE === "true") {
    args.overwrite = true;
  }
  if (!args.reportPath && process.env.REPORT_PATH) {
    args.reportPath = process.env.REPORT_PATH;
  }

  return args;
};

type ProductRow = {
  id: string;
  title: string;
  handle: string;
  status: string;
  metadata: Record<string, unknown> | null;
  variants?: { sku: string | null; title: string | null }[];
};

type AttributeRow = { id: string; key: string; type: AttributeType };

type ValueRow = {
  id: string;
  product_id: string;
  attribute_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
};

const sameValue = (
  stored: ValueRow,
  typed: { value_text: string | null; value_number: number | null; value_boolean: boolean | null },
): boolean =>
  (stored.value_text ?? null) === typed.value_text &&
  // The column is Postgres `real`, so a written 0.3 reads back as 0.30000001…
  // and an exact comparison would report every float as «changed» forever.
  (stored.value_number === null || typed.value_number === null
    ? stored.value_number === typed.value_number
    : Math.abs(stored.value_number - typed.value_number) < 1e-3) &&
  (stored.value_boolean ?? null) === typed.value_boolean;

export default async function backfillProductAttributes({
  container,
  args: execArgs,
}: {
  container: MedusaContainer;
  args?: string[];
}) {
  const logger: Logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const service: TenantModuleService = container.resolve(TENANT_MODULE);
  const args = parseArgs(execArgs ?? []);

  if (!args.tenantHandle) {
    logger.error(
      "backfill-product-attributes: the shop handle is required — pass it as the first argument or as TENANT_HANDLE.",
    );
    return;
  }

  const {
    data: [tenant],
  } = await query.graph({
    entity: "tenant",
    fields: ["id", "handle", "name", "products.id"],
    filters: { handle: args.tenantHandle },
  });

  if (!tenant?.id) {
    logger.error(`backfill-product-attributes: no shop with handle "${args.tenantHandle}".`);
    return;
  }

  const productIds = ((tenant.products ?? []) as ({ id?: string | null } | null)[])
    .map((product) => product?.id ?? null)
    .filter((id): id is string => Boolean(id));

  if (!productIds.length) {
    logger.warn(`backfill-product-attributes: shop "${tenant.handle}" has no products linked to it.`);
    return;
  }

  // ---- 1. the schema

  const schema = args.dryRun
    ? { created: [], existing: [] }
    : await ensureDefaultSchema(container, tenant.id);

  if (args.dryRun) {
    logger.info("backfill-product-attributes: --dry-run, the schema is read and not written.");
  } else {
    logger.info(
      `backfill-product-attributes: schema of "${tenant.handle}" — created ${schema.created.length} (${
        schema.created.join(", ") || "none"
      }), already there ${schema.existing.length}.`,
    );
  }

  const attributes = (await service.listTenantProductAttributes({
    tenant_id: tenant.id,
  })) as unknown as AttributeRow[];
  const attributeByKey = new Map(attributes.map((attribute) => [attribute.key, attribute]));

  // A dry run on a shop that has no schema yet still has to say what the run
  // WOULD fill, so the preset stands in for the rows it would have created.
  // Their id is never dereferenced: the write paths below all exit early under
  // `--dry-run`.
  if (args.dryRun) {
    for (const preset of DEFAULT_ATTRIBUTE_PRESET) {
      if (!attributeByKey.has(preset.key)) {
        attributeByKey.set(preset.key, { id: "(not created yet)", key: preset.key, type: preset.type });
      }
    }
  }

  // ---- 2. the catalog

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "status", "metadata", "variants.sku", "variants.title"],
    filters: { id: productIds },
  });

  const existingValues = (await service.listTenantProductAttributeValues({
    product_id: productIds,
  })) as unknown as ValueRow[];

  const valueByProductAttribute = new Map(
    existingValues.map((row) => [`${row.product_id}:${row.attribute_id}`, row]),
  );

  const report = {
    tenant: { id: tenant.id as string, handle: tenant.handle as string, name: tenant.name as string },
    dry_run: args.dryRun,
    overwrite: args.overwrite,
    products_total: products.length,
    products_with_values: 0,
    /**
     * Products carrying something the catalog DESCRIBED, the article number
     * left out. Every product has a SKU, so `products_with_values` alone would
     * report a full catalog for a run that filled nothing but its own column.
     */
    products_with_described_values: 0,
    products_without_values: [] as { handle: string; title: string; status: string }[],
    schema,
    values: { created: 0, updated: 0, unchanged: 0, kept_owner_value: 0, failed: 0 },
    per_attribute: {} as Record<string, number>,
    /** Which source each written value came from, by the name the bag used. */
    per_source: {} as Record<string, number>,
    choices_created: [] as string[],
    unrecognised: {} as Record<string, number>,
    rejected: [] as { handle: string; name: string; value: string; reason: string }[],
    failures: [] as { handle: string; key: string; message: string }[],
  };

  for (const raw of products as ProductRow[]) {
    const variants = raw.variants ?? [];
    const sku = variants.map((variant) => variant.sku).find(Boolean) ?? null;
    // One variant is the shop's own shape (measured: 38 products, 38 variants),
    // so a second one would make the title ambiguous and is left out.
    const variantTitle = variants.length === 1 ? variants[0]?.title ?? null : null;
    const parsed = collectProductValues({ metadata: raw.metadata, sku, variantTitle });

    for (const entry of parsed.unrecognised) {
      report.unrecognised[entry.name] = (report.unrecognised[entry.name] ?? 0) + 1;
    }
    for (const entry of parsed.rejected) {
      report.rejected.push({
        handle: raw.handle,
        name: entry.name,
        value: entry.value,
        reason: entry.reason,
      });
    }

    let wrote = 0;
    let described = 0;

    const countSource = (key: PresetAttributeKey) => {
      const source = parsed.sources[key] ?? "(unknown)";
      const bucket = source.startsWith("metadata.") || source === "variant.sku" || source === "variant.title"
        ? source
        : "metadata.full_characteristics";
      report.per_source[bucket] = (report.per_source[bucket] ?? 0) + 1;
    };

    for (const [key, value] of Object.entries(parsed.values) as [
      PresetAttributeKey,
      string | number,
    ][]) {
      const attribute = attributeByKey.get(key);
      if (!attribute) {
        // The shop deleted this characteristic from its schema. Its catalog
        // still carries the fact, and that is the owner's decision, not an error.
        continue;
      }

      let submitted: string | number = value;

      if (attribute.type === "select") {
        if (args.dryRun) {
          report.per_attribute[key] = (report.per_attribute[key] ?? 0) + 1;
          countSource(key);
          wrote += 1;
          described += 1;
          continue;
        }
        const choice = await ensureChoice(container, attribute.id, String(value));
        if (!choice) {
          continue;
        }
        if (choice.created) {
          report.choices_created.push(`${key}:${choice.value}`);
        }
        submitted = choice.value;
      }

      const options = args.dryRun
        ? []
        : ((await service.listTenantProductAttributeOptions({
            attribute_id: attribute.id,
          })) as unknown as { id: string; value: string; label: string; position: number }[]);

      let typed;
      try {
        typed = coerceValue(attribute, options, submitted);
      } catch (error) {
        report.values.failed += 1;
        report.failures.push({
          handle: raw.handle,
          key,
          message: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      if (!typed) {
        continue;
      }

      const stored = valueByProductAttribute.get(`${raw.id}:${attribute.id}`);

      if (stored && sameValue(stored, typed)) {
        report.values.unchanged += 1;
        report.per_attribute[key] = (report.per_attribute[key] ?? 0) + 1;
        countSource(key);
        wrote += 1;
        described += key === "sku" ? 0 : 1;
        continue;
      }

      if (stored && !args.overwrite) {
        report.values.kept_owner_value += 1;
        report.per_attribute[key] = (report.per_attribute[key] ?? 0) + 1;
        countSource(key);
        wrote += 1;
        described += key === "sku" ? 0 : 1;
        continue;
      }

      report.per_attribute[key] = (report.per_attribute[key] ?? 0) + 1;
      countSource(key);
      wrote += 1;
      described += key === "sku" ? 0 : 1;

      if (args.dryRun) {
        report.values[stored ? "updated" : "created"] += 1;
        continue;
      }

      if (stored) {
        await service.updateTenantProductAttributeValues({ id: stored.id, ...typed });
        report.values.updated += 1;
        continue;
      }

      await service.createTenantProductAttributeValues({
        tenant_id: tenant.id,
        product_id: raw.id,
        attribute_id: attribute.id,
        ...typed,
      });
      report.values.created += 1;
    }

    if (wrote) {
      report.products_with_values += 1;
    }
    if (described) {
      report.products_with_described_values += 1;
    }
    if (!wrote) {
      report.products_without_values.push({
        handle: raw.handle,
        title: raw.title,
        status: raw.status,
      });
    }
  }

  // ---- 3. what happened

  const line = (label: string, value: unknown) => logger.info(`  ${label}: ${String(value)}`);

  logger.info(`backfill-product-attributes: shop "${tenant.handle}" (${tenant.name})`);
  line("products", report.products_total);
  line(
    "products with at least one characteristic",
    `${report.products_with_values} of ${report.products_total}`,
  );
  line(
    "of them described by the catalog (the article number aside)",
    `${report.products_with_described_values} of ${report.products_total}`,
  );
  line("values created", report.values.created);
  line("values updated", report.values.updated);
  line("values already equal", report.values.unchanged);
  line("values left as the owner typed them", report.values.kept_owner_value);
  line("values refused by the schema", report.values.failed);
  line(
    "per characteristic",
    Object.entries(report.per_attribute)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => `${key}=${count}`)
      .join(" ") || "none",
  );
  line(
    "per source",
    Object.entries(report.per_source)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => `${source}=${count}`)
      .join(" ") || "none",
  );
  line("choices declared from the catalog", report.choices_created.join(", ") || "none");
  line(
    "names the schema has no place for",
    Object.entries(report.unrecognised)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => `${name}×${count}`)
      .join(", ") || "none",
  );

  if (!args.dryRun && (report.values.created || report.values.updated)) {
    const status = await notifyStorefrontRevalidate({
      type: "tenant.product-attributes",
      handle: tenant.handle as string,
    });
    line("storefront revalidate", status === null ? "not configured" : `HTTP ${status}`);
  }

  if (args.reportPath) {
    writeFileSync(args.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    line("report", args.reportPath);
  }
}
