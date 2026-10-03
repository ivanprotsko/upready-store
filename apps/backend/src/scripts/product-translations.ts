import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { readFileSync, writeFileSync } from "node:fs";
import {
  PRODUCT_OPTION_REFERENCE,
  PRODUCT_REFERENCE,
  PRODUCT_VARIANT_REFERENCE,
  readTranslationsByLocale,
  upsertTranslationFields,
} from "../api/tenants/products/translations-helpers";
import { notifyStorefrontRevalidate } from "../storefront-revalidate";

/**
 * t-cherk-37: translates a whole catalogue in one batch, for the owner to
 * review before the panel's per-product «Переводы» screen is used for
 * one-off touch-ups.
 *
 *   npx medusa exec ./src/scripts/product-translations.ts export cherkashino en ./translations-en.json
 *   npx medusa exec ./src/scripts/product-translations.ts import cherkashino en ./translations-en.json
 *
 * No `--tenant`/`--locale` flags: `medusa exec` parses its own command line
 * and rejects an argument it does not recognise itself (measured on the
 * Medusa CLI 2.19, the same constraint `backfill-product-attributes.ts`
 * documents), so every argument here is positional. Every positional also has
 * an environment twin for a `docker exec` on the shared engine:
 * `TENANT_HANDLE`, `LOCALE`, `TRANSLATIONS_FILE`.
 *
 * `export` never writes. `import` is idempotent: importing the same file
 * twice leaves the same rows, because it goes through the same
 * `upsertTranslationFields` the panel's own PUT route uses, which merges into
 * a locale's existing row rather than creating a second one.
 */

export type ExportedProduct = {
  product_id: string;
  handle: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  translated_title: string | null;
  translated_subtitle: string | null;
  translated_description: string | null;
  options: { id: string; title: string; translated_title: string | null }[];
  variants: { id: string; title: string; translated_title: string | null }[];
};

type ProductGraphRow = {
  id: string;
  handle: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  options: { id: string; title: string }[];
  variants: { id: string; title: string }[];
};

/** Pure: one product's base text plus whatever `locale` already carries, for `export`. */
export const buildExportRow = (
  product: ProductGraphRow,
  locale: string,
  productTranslations: Map<string, Map<string, Record<string, unknown>>>,
  optionTranslations: Map<string, Map<string, Record<string, unknown>>>,
  variantTranslations: Map<string, Map<string, Record<string, unknown>>>,
): ExportedProduct => {
  const translatedText = (id: string, field: string, by: typeof productTranslations) => {
    const value = by.get(id)?.get(locale)?.[field];
    return typeof value === "string" && value ? value : null;
  };

  return {
    product_id: product.id,
    handle: product.handle,
    title: product.title,
    subtitle: product.subtitle,
    description: product.description,
    translated_title: translatedText(product.id, "title", productTranslations),
    translated_subtitle: translatedText(product.id, "subtitle", productTranslations),
    translated_description: translatedText(product.id, "description", productTranslations),
    options: product.options.map((option) => ({
      id: option.id,
      title: option.title,
      translated_title: translatedText(option.id, "title", optionTranslations),
    })),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      translated_title: translatedText(variant.id, "title", variantTranslations),
    })),
  };
};

type Args = {
  command: "export" | "import" | null;
  tenantHandle: string | null;
  locale: string | null;
  filePath: string | null;
};

const parseArgs = (argv: string[]): Args => {
  const [command, tenantHandle, locale, filePath] = argv;
  return {
    command: command === "export" || command === "import" ? command : null,
    tenantHandle: tenantHandle ?? process.env.TENANT_HANDLE ?? null,
    locale: locale ?? process.env.LOCALE ?? null,
    filePath: filePath ?? process.env.TRANSLATIONS_FILE ?? null,
  };
};

const usage =
  "usage: medusa exec ./src/scripts/product-translations.ts <export|import> <tenant-handle> <locale> <file>";

export default async function productTranslations({
  container,
  args: execArgs,
}: {
  container: MedusaContainer;
  args?: string[];
}) {
  const logger: Logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const args = parseArgs(execArgs ?? []);

  if (!args.command || !args.tenantHandle || !args.locale || !args.filePath) {
    logger.error(`product-translations: ${usage}`);
    return;
  }

  const {
    data: [tenant],
  } = await query.graph({
    entity: "tenant",
    fields: ["id", "handle", "products.id"],
    filters: { handle: args.tenantHandle },
  });

  if (!tenant?.id) {
    logger.error(`product-translations: no shop with handle "${args.tenantHandle}".`);
    return;
  }

  const productIds = ((tenant.products ?? []) as ({ id?: string | null } | null)[])
    .map((product) => product?.id ?? null)
    .filter((id): id is string => Boolean(id));

  if (!productIds.length) {
    logger.warn(`product-translations: shop "${args.tenantHandle}" has no products linked to it.`);
    return;
  }

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "title",
      "subtitle",
      "description",
      "options.id",
      "options.title",
      "variants.id",
      "variants.title",
    ],
    filters: { id: productIds },
  });
  const rows = products as unknown as ProductGraphRow[];

  if (args.command === "export") {
    const [productTranslations, optionTranslations, variantTranslations] = await Promise.all([
      readTranslationsByLocale(container, rows.map((product) => product.id)),
      readTranslationsByLocale(container, rows.flatMap((product) => product.options.map((o) => o.id))),
      readTranslationsByLocale(container, rows.flatMap((product) => product.variants.map((v) => v.id))),
    ]);

    const exported = rows.map((product) =>
      buildExportRow(
        product,
        args.locale as string,
        productTranslations,
        optionTranslations,
        variantTranslations,
      ),
    );

    writeFileSync(args.filePath, JSON.stringify(exported, null, 2) + "\n", "utf8");
    logger.info(
      `product-translations: exported ${exported.length} products of "${args.tenantHandle}" for locale "${args.locale}" to ${args.filePath}.`,
    );
    return;
  }

  // ---- import
  const incoming = JSON.parse(readFileSync(args.filePath, "utf8")) as ExportedProduct[];
  const ownIds = new Set(productIds);
  const byId = new Map(incoming.map((row) => [row.product_id, row]));

  let productsWritten = 0;
  let foreign = 0;

  for (const [productId, row] of byId) {
    if (!ownIds.has(productId)) {
      foreign += 1;
      continue;
    }

    await upsertTranslationFields(container, PRODUCT_REFERENCE, productId, args.locale, {
      title: row.translated_title ?? undefined,
      subtitle: row.translated_subtitle ?? undefined,
      description: row.translated_description ?? undefined,
    });

    await Promise.all(
      row.options.map((option) =>
        option.translated_title
          ? upsertTranslationFields(container, PRODUCT_OPTION_REFERENCE, option.id, args.locale as string, {
              title: option.translated_title,
            })
          : Promise.resolve(),
      ),
    );
    await Promise.all(
      row.variants.map((variant) =>
        variant.translated_title
          ? upsertTranslationFields(container, PRODUCT_VARIANT_REFERENCE, variant.id, args.locale as string, {
              title: variant.translated_title,
            })
          : Promise.resolve(),
      ),
    );

    productsWritten += 1;
  }

  if (productsWritten) {
    await notifyStorefrontRevalidate({ type: "translation.updated", handle: tenant.handle as string });
  }

  logger.info(
    `product-translations: imported ${productsWritten} products of "${args.tenantHandle}" for locale "${args.locale}" from ${args.filePath}` +
      (foreign ? `, skipped ${foreign} row(s) naming a product outside this shop.` : "."),
  );
}
