import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { applyDataset, SECTIONS, type Section } from "../catalog-enrich/apply";
import { buildDataset } from "../catalog-enrich/build";
import { datasetCounts, parseDataset, type EnrichDataset } from "../catalog-enrich/dataset";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";

/**
 * Enriching the products a shop ALREADY has from its Wildberries cabinet
 * (w07-tenant-catalog-enrich).
 *
 *   TENANT_HANDLE=cherkashino DRY_RUN=true \
 *     npx medusa exec ./src/scripts/catalog-enrich-from-wb.ts
 *   TENANT_HANDLE=cherkashino APPLY=true EXPORT_PATH=./dataset.json \
 *     npx medusa exec ./src/scripts/catalog-enrich-from-wb.ts
 *   TENANT_HANDLE=cherkashino APPLY=true IMPORT_PATH=./dataset.json ONLY=titles,prices \
 *     npx medusa exec ./src/scripts/catalog-enrich-from-wb.ts
 *
 * Every argument has an environment twin and the environment is the form the
 * acceptance commands use: `medusa exec` parses the command line in front of
 * the script and swallows a leading `--` («Unknown arguments: tenant,
 * dry-run», measured on the Medusa CLI 2.19 and written down in
 * `wb-args.ts`), and `pnpm --filter …` is a second parser in the chain.
 *
 * Ivan's order of 2026-09-16 04:44 WITA, which is what the flags below serve:
 * add the title, the price, the characteristics, the reviews and the photos of
 * the WB card to the products the shop already has; create nothing, delete
 * nothing, and leave the shop's own first image first as the cover.
 *
 * `EXPORT_PATH` writes the dataset the live host is enriched from (task d07):
 * public card data only, no key, no token. `IMPORT_PATH` replays such a file
 * and never touches Wildberries, which is the only way to run this where the
 * cabinet key is absent.
 *
 * Nothing is written without `APPLY=true`. A run with neither `APPLY` nor
 * `DRY_RUN` is a dry run: the default of a script that edits a live catalog
 * has to be the harmless one.
 */

type Args = {
  tenantHandle: string | null;
  apply: boolean;
  sections: Set<Section>;
  exportPath: string | null;
  importPath: string | null;
  reportPath: string | null;
};

const parseSections = (raw: string | null): Set<Section> => {
  if (!raw || raw.trim() === "" || raw.trim() === "all") {
    return new Set(SECTIONS);
  }

  const wanted = raw
    .split(",")
    .map((one) => one.trim())
    .filter(Boolean) as Section[];

  return new Set(wanted.filter((one) => (SECTIONS as readonly string[]).includes(one)));
};

export const parseArgs = (argv: string[], env: NodeJS.ProcessEnv = process.env): Args => {
  const values: Record<string, string | null> = {
    tenant: null,
    only: null,
    export: null,
    import: null,
    report: null,
  };
  let apply = false;
  let dryRun = false;

  for (const raw of argv) {
    const arg = String(raw).replace(/^--/, "");

    if (arg === "apply") {
      apply = true;
      continue;
    }
    if (arg === "dry-run") {
      dryRun = true;
      continue;
    }

    const separator = arg.indexOf("=");
    if (separator > 0) {
      const name = arg.slice(0, separator);
      const value = arg.slice(separator + 1);
      if (name === "tenant" || name === "handle") {
        values.tenant = value;
      } else if (name in values) {
        values[name] = value;
      }
      continue;
    }

    if (!arg.includes("=") && !values.tenant) {
      values.tenant = arg;
    }
  }

  if (env.APPLY === "true") {
    apply = true;
  }
  if (env.DRY_RUN === "true") {
    dryRun = true;
  }

  return {
    tenantHandle: values.tenant ?? env.TENANT_HANDLE ?? null,
    // An explicit `dry-run` beats an `apply`: of the two mistakes, running a
    // dry run by accident is the one that changes nothing.
    apply: apply && !dryRun,
    sections: parseSections(values.only ?? env.ONLY ?? null),
    exportPath: values.export ?? env.EXPORT_PATH ?? null,
    importPath: values.import ?? env.IMPORT_PATH ?? null,
    reportPath: values.report ?? env.REPORT_PATH ?? null,
  };
};

const writeJson = (path: string, payload: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

export default async function catalogEnrichFromWb({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const parsed = parseArgs(args ?? []);

  if (!parsed.tenantHandle) {
    logger.error(
      "catalog:enrich-from-wb: назовите магазин — TENANT_HANDLE=<handle> " +
        "[APPLY=true] [ONLY=titles,prices,characteristics,reviews,images] " +
        "[EXPORT_PATH=<file>] [IMPORT_PATH=<file>] [REPORT_PATH=<file>]",
    );
    process.exitCode = 1;
    return;
  }

  if (!parsed.sections.size) {
    logger.error(
      `catalog:enrich-from-wb: ONLY не назвал ни одного известного раздела. Известны: ${SECTIONS.join(", ")}.`,
    );
    process.exitCode = 1;
    return;
  }

  const tenantModule = container.resolve<TenantModuleService>(TENANT_MODULE);
  const [tenant] = (await tenantModule.listTenants({ handle: parsed.tenantHandle })) as unknown as {
    id: string;
    handle: string;
  }[];

  if (!tenant) {
    logger.error(`catalog:enrich-from-wb: на этом стенде нет магазина с handle "${parsed.tenantHandle}".`);
    process.exitCode = 1;
    return;
  }

  let dataset: EnrichDataset;
  let reviewsSkipped = { no_text: 0, no_rating: 0 };

  if (parsed.importPath) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(parsed.importPath, "utf8"));
    } catch (error) {
      logger.error(
        `catalog:enrich-from-wb: не прочитать ${parsed.importPath}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
      process.exitCode = 1;
      return;
    }

    const checked = parseDataset(raw);
    if (!checked.ok) {
      logger.error(`catalog:enrich-from-wb: ${parsed.importPath} — ${checked.error}`);
      process.exitCode = 1;
      return;
    }

    if (checked.dataset.tenant_handle !== tenant.handle) {
      logger.error(
        `catalog:enrich-from-wb: датасет собран для магазина "${checked.dataset.tenant_handle}", ` +
          `а запуск идёт по "${tenant.handle}". Это разные каталоги — отказ.`,
      );
      process.exitCode = 1;
      return;
    }

    dataset = checked.dataset;
    logger.info(
      `catalog:enrich-from-wb: датасет из ${parsed.importPath}, собран ${dataset.generated_at}, ` +
        `зеркало WB не читается.`,
    );
  } else {
    const built = await buildDataset(container, tenant, new Date());
    dataset = built.dataset;
    reviewsSkipped = built.reviews_skipped;
  }

  const counts = datasetCounts(dataset);

  logger.info(
    `catalog:enrich-from-wb: магазин ${tenant.handle} (${tenant.id}), ` +
      `${parsed.apply ? "APPLY" : "DRY-RUN"}, разделы ${[...parsed.sections].join(", ")}.`,
  );
  logger.info(
    `catalog:enrich-from-wb: сопоставлено товаров ${counts.products}, ` +
      `не сопоставлено ${dataset.unmatched_products.length}, карточек без товара ${dataset.unmatched_cards}. ` +
      `В датасете: заголовков ${counts.titles}, цен ${counts.prices}, ` +
      `характеристик ${counts.characteristics}, отзывов ${counts.reviews}, фото ${counts.images}.`,
  );

  if (dataset.unmatched_products.length) {
    logger.info(
      `catalog:enrich-from-wb: без карточки WB остались — ${dataset.unmatched_products
        .map((product) => `${product.sku ?? product.handle} («${product.title}»)`)
        .join("; ")}`,
    );
  }

  if (reviewsSkipped.no_text) {
    logger.info(
      `catalog:enrich-from-wb: ${reviewsSkipped.no_text} отзывов WB несут только оценку без текста — ` +
        "они не переносятся, тело отзыва в product_review обязательное.",
    );
  }

  if (reviewsSkipped.no_rating) {
    logger.warn(
      `catalog:enrich-from-wb: ${reviewsSkipped.no_rating} отзывов WB без оценки — не переносятся. ` +
        "Звезду за покупателя здесь никто не ставит (правило 20a).",
    );
  }

  if (parsed.exportPath) {
    writeJson(parsed.exportPath, dataset);
    logger.info(`catalog:enrich-from-wb: датасет записан в ${parsed.exportPath}`);
  }

  const result = await applyDataset(container, tenant, dataset, {
    dryRun: !parsed.apply,
    sections: parsed.sections,
    logger,
  });

  if (result.missing_handles.length) {
    logger.warn(
      `catalog:enrich-from-wb: в каталоге нет товаров с handle ${result.missing_handles.join(", ")} — ` +
        "датасет собран на другом стенде или товар удалили. Ничего не создано.",
    );
  }

  const counters = result.counters;
  logger.info(
    `catalog:enrich-from-wb: связей создано ${result.links.created}, обновлено ${result.links.updated}, ` +
      `без изменений ${result.links.unchanged}.`,
  );
  logger.info(
    `catalog:enrich-from-wb: заголовки ${counters.titles_updated} (без изменений ${counters.titles_unchanged}, ` +
      `нет у WB ${counters.titles_absent}); цены ${counters.prices_updated} ` +
      `(без изменений ${counters.prices_unchanged}, нет у WB ${counters.prices_absent}); ` +
      `характеристики ${counters.characteristics_written} (без изменений ${counters.characteristics_unchanged}, ` +
      `новых характеристик магазина ${counters.attributes_created}, не принято ${counters.characteristics_dropped}); ` +
      `отзывы ${counters.reviews_imported} (уже были ${counters.reviews_unchanged}); ` +
      `фото ${counters.images_added} (уже были ${counters.images_already_there}, ` +
      `не скачались ${counters.images_failed}).`,
  );

  if (parsed.reportPath) {
    writeJson(parsed.reportPath, {
      generated_at: new Date().toISOString(),
      tenant: { id: tenant.id, handle: tenant.handle },
      mode: parsed.apply ? "apply" : "dry-run",
      sections: [...parsed.sections],
      dataset: { ...counts, source: dataset.source, generated_at: dataset.generated_at },
      unmatched_products: dataset.unmatched_products,
      unmatched_cards: dataset.unmatched_cards,
      reviews_skipped: reviewsSkipped,
      links: result.links,
      counters,
      missing_handles: result.missing_handles,
    });
    logger.info(`catalog:enrich-from-wb: отчёт записан в ${parsed.reportPath}`);
  }

  // A run that could not download a photo has to leave a non-zero exit code, or
  // a wrapper reads «the script finished» as «every photo is there» (rule 20a).
  if (counters.images_failed > 0) {
    process.exitCode = 1;
  }
}
