import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import { createTranslationsWorkflow } from "@medusajs/medusa/core-flows";
import { readFileSync, writeFileSync } from "node:fs";

/**
 * Cherkashina migration, product localizations: the source kept them in its own
 * `product_translation` table (6 live rows, all `en`); the target keeps entity
 * translations in Medusa's translation module. This script writes them through
 * `createTranslationsWorkflow` (a core flow, never SQL) and marks the registry rows.
 *
 *   npx medusa exec ./src/scripts/cherkashina-translate-products.ts \
 *     <02-mapping-registry.json> <source-snapshot.json> [dry-run]  (a bare word: medusa exec owns the -- flags)
 */
type RegistryRow = {
  kind: string;
  source_id: string;
  source_handle: string | null;
  locale?: string;
  target_id?: string | null;
  status: string;
  reason?: string;
  fields?: string[];
  checked_at?: string;
};

const TRANSLATABLE = ["title", "subtitle", "description"] as const;

export default async function translateProducts({ container, args }: ExecArgs) {
  const [registryPath, snapshotPath, ...rest] = args ?? [];
  const dry = rest.includes("dry-run") || rest.includes("--dry-run");
  if (!registryPath || !snapshotPath) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "usage: <registry.json> <source-snapshot.json> [dry-run]");
  }
  const registry = JSON.parse(readFileSync(registryPath, "utf8")) as { rows: RegistryRow[] };
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
    product_translations: Array<Record<string, string | null> & { product_handle: string; locale: string }>;
  };
  const translationService = container.resolve(Modules.TRANSLATION);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const rows = registry.rows.filter((r) => r.kind === "product_translation" && r.target_id);
  let written = 0;
  for (const row of rows) {
    const source = snapshot.product_translations.find(
      (t) => t.product_handle === row.source_handle && t.locale === row.locale,
    );
    if (!source) {
      row.status = "failed";
      row.reason = "no product_translation row in the snapshot";
      continue;
    }
    const translations: Record<string, string> = {};
    for (const field of TRANSLATABLE) {
      const value = source[field];
      if (value) translations[field] = value;
    }
    const dropped = Object.keys(source).filter(
      (k) => !["product_handle", "locale", "product_live", ...TRANSLATABLE].includes(k) && source[k],
    );
    if (!Object.keys(translations).length) {
      row.status = "skipped";
      row.reason = "no translatable product field (title/subtitle/description) carried a value";
      continue;
    }
    const existing = await translationService.listTranslations({
      reference: "product",
      reference_id: row.target_id as string,
      locale_code: row.locale as string,
    });
    if (dry) {
      row.status = "pending";
      row.reason = `dry-run: would ${existing.length ? "update" : "create"} ${Object.keys(translations).join(",")}${dropped.length ? ` (no product field for: ${dropped.join(",")})` : ""}`;
      continue;
    }
    try {
      if (existing.length) {
        await translationService.updateTranslations({ id: existing[0].id, translations });
      } else {
        await createTranslationsWorkflow(container).run({
          input: {
            translations: [
              {
                reference: "product",
                reference_id: row.target_id as string,
                locale_code: row.locale as string,
                translations,
              },
            ],
          },
        });
      }
      written += 1;
      row.status = "migrated";
      row.reason = `translation module: ${Object.keys(translations).join(",")} for locale ${row.locale}${dropped.length ? `; not a product field, kept only in the snapshot: ${dropped.join(",")}` : ""}`;
    } catch (e) {
      row.status = "failed";
      row.reason = (e as Error).message;
    }
  }
  writeFileSync(registryPath, JSON.stringify(registry, null, 1) + "\n");
  logger.info(`cherkashina-translate-products: ${rows.length} rows, ${written} written${dry ? " (dry-run)" : ""}`);
  const failed = rows.filter((r) => r.status === "failed");
  if (failed.length) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `${failed.length} translation row(s) failed: ${failed.map((r) => `${r.source_id}: ${r.reason}`).join("; ")}`);
  }
}
