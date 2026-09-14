import fs from "node:fs";
import path from "node:path";
import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { PRODUCT_REVIEW_MODULE } from "../modules/product-review";
import type ProductReviewModuleService from "../modules/product-review/service";
import { matchReviewProduct } from "../reviews-import/cherkashina-rules";

/**
 * Carries the client's own product reviews from the shop she ran before this
 * platform (olavka.ru) into her tenant here (t09-reviews).
 *
 *   REVIEWS_DATA_DIR=…/chrxnasdmds/apps/storefront/src/lib/data \
 *   REVIEWS_MAPPING_REGISTRY=…/2026-09-12-cherkashina-migration/02-mapping-registry.json \
 *   REVIEWS_SOURCE_DB=postgres://ivanprotsko@localhost:5433/medusa_chrxn \
 *     npx medusa exec ./src/scripts/import-cherkashina-reviews.ts dry-run
 *
 * `dry-run` and `allow-unmapped` are written WITHOUT leading dashes: the CLI
 * parses its own command line with yargs and exits on a flag it does not know.
 *
 * Three sources, because the corpus is split across three of them:
 *
 * - `reviews-data.json` / `reviews-data.en.json` carry the STRUCTURE of each
 *   review (id, rating, date, the marketplace name of the product) in Russian
 *   and English. 166 reviews, the same ids in both files.
 * - The old shop's `translation` table (`resource = 'review'`, fields `author`
 *   and `text`, locales `ru` and `en` — 332 rows per locale, 664 in all) is the
 *   OVERRIDE layer: the owner edited author names and texts in her admin and
 *   those edits never went back into the files. The old storefront read the
 *   files and applied this overlay on top (`reviews-server.ts`), and so does
 *   this script. Leave `REVIEWS_SOURCE_DB` unset and it imports the files
 *   alone, and says so.
 * - The migration registry maps the old product handle to the product id here.
 *
 * What it writes: one row per (review × product × language), `source =
 * imported`, `status = published`. Published on arrival because these reviews
 * were already public on the shop they came from — this is a move, not a new
 * submission, and asking the owner to re-approve 310 rows she already approved
 * once would be busywork. A review a customer leaves on the storefront is a
 * different case and arrives `pending`.
 *
 * Idempotent through `source_key` (`chrxn:<id>`): the unique index on
 * (tenant, product, source_key, language) is what a second run reads, so it
 * writes nothing. A review the owner DELETED in the panel is soft-deleted and
 * falls out of that index, so a later run brings it back — deliberate: the
 * script's job is to make the shop hold the corpus.
 *
 * Exit codes: 0 when every review found a product, 3 when some did not. The
 * unmapped ones are always printed with their names and counts, never dropped
 * silently (rule 20a). Pass `allow-unmapped` once the printed list has been
 * read and accepted to get a 0 out of the same run.
 */

type SourceReview = {
  id: number;
  author: string;
  date: string;
  rating: number;
  text: string;
  product: string | null;
  source?: string;
};

type MappingRow = {
  kind: string;
  source_handle?: string;
  target_id?: string;
  title?: string;
  status?: string;
};

type Overlay = Map<string, { author?: string; text?: string }>;

const SOURCE_PREFIX = "chrxn";
const LOCALES = ["ru", "en"] as const;
type Locale = (typeof LOCALES)[number];

const readJson = <T>(file: string): T => {
  if (!fs.existsSync(file)) {
    throw new Error(`Source file not found: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
};

/**
 * The owner's edits to author and text, per locale, straight out of the old
 * shop's `translation` table. `pg` is a devDependency of this app: the script
 * is a one-off migration tool and the backend itself never opens a second
 * database.
 */
const loadOverlay = async (connectionString: string, logger: Logger): Promise<Map<Locale, Overlay>> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require("pg") as typeof import("pg");
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query<{
      resource_key: string;
      field: string;
      locale: string;
      value: string;
    }>(
      `select resource_key, field, locale, value
         from translation
        where resource = 'review' and deleted_at is null`,
    );
    logger.info(`source database: ${rows.length} translation rows for resource 'review'`);

    const byLocale = new Map<Locale, Overlay>();
    for (const locale of LOCALES) byLocale.set(locale, new Map());

    for (const row of rows) {
      const overlay = byLocale.get(row.locale as Locale);
      if (!overlay) continue;
      const entry = overlay.get(row.resource_key) ?? {};
      if (row.field === "author") entry.author = row.value;
      if (row.field === "text") entry.text = row.value;
      overlay.set(row.resource_key, entry);
    }
    return byLocale;
  } finally {
    await client.end();
  }
};

const parseDate = (raw: string | undefined): Date | null => {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export default async function importCherkashinaReviews({
  container,
  args = [],
}: {
  container: MedusaContainer;
  args?: string[];
}) {
  const logger: Logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  // `medusa exec` parses the command line with yargs and rejects a flag it does
  // not know, so the switches arrive as bare positional words
  // (`medusa exec ./script.ts dry-run`). Both spellings are accepted anyway,
  // and so is the environment, because a `--dry-run` typed out of habit must
  // not turn into a real run.
  const flag = (name: string) => args.includes(name) || args.includes(`--${name}`);
  const dryRun = flag("dry-run") || process.env.REVIEWS_DRY_RUN === "1";
  const allowUnmapped = flag("allow-unmapped") || process.env.REVIEWS_ALLOW_UNMAPPED === "1";

  const dataDir = process.env.REVIEWS_DATA_DIR;
  const registryPath = process.env.REVIEWS_MAPPING_REGISTRY;
  const tenantHandle = process.env.REVIEWS_TENANT_HANDLE ?? "cherkashino";
  const sourceDb = process.env.REVIEWS_SOURCE_DB;

  if (!dataDir || !registryPath) {
    throw new Error(
      "Set REVIEWS_DATA_DIR (the directory holding reviews-data.json and reviews-data.en.json) " +
        "and REVIEWS_MAPPING_REGISTRY (the migration's 02-mapping-registry.json).",
    );
  }

  const ru = readJson<SourceReview[]>(path.join(dataDir, "reviews-data.json"));
  const en = readJson<SourceReview[]>(path.join(dataDir, "reviews-data.en.json"));
  const registry = readJson<{ rows: MappingRow[] }>(registryPath);

  const enById = new Map(en.map((review) => [String(review.id), review]));
  logger.info(`source files: ${ru.length} reviews (ru), ${en.length} reviews (en)`);

  const overlays = sourceDb
    ? await loadOverlay(sourceDb, logger)
    : new Map<Locale, Overlay>(LOCALES.map((locale) => [locale, new Map()]));

  if (!sourceDb) {
    logger.warn(
      "REVIEWS_SOURCE_DB is not set: author and text come from the JSON files alone, " +
        "without the owner's later edits from the old shop's translation table.",
    );
  }

  // ---- the tenant and the products it actually owns here
  const {
    data: [tenant],
  } = await query.graph({
    entity: "tenant",
    fields: ["id", "handle", "name", "products.id"],
    filters: { handle: [tenantHandle] },
  });

  if (!tenant?.id) {
    throw new Error(`Tenant with handle "${tenantHandle}" was not found on this backend.`);
  }

  const ownedProductIds = new Set(
    ((tenant.products ?? []) as { id?: string }[])
      .map((product) => product?.id)
      .filter((id): id is string => Boolean(id)),
  );
  logger.info(
    `tenant ${tenant.handle} (${tenant.id}) owns ${ownedProductIds.size} products on this backend`,
  );

  const handleToTarget = new Map<string, MappingRow>();
  for (const row of registry.rows) {
    if (row.kind === "product" && row.source_handle && row.target_id) {
      handleToTarget.set(row.source_handle, row);
    }
  }
  logger.info(`mapping registry: ${handleToTarget.size} product rows`);

  // ---- match every review to a product, counting every outcome
  type PlannedRow = {
    product_id: string;
    source_key: string;
    language: Locale;
    author_name: string;
    body: string;
    rating: number;
    review_date: Date | null;
  };

  const planned: PlannedRow[] = [];
  const notSoldHere = new Map<string, number>();
  const noRule = new Map<string, number>();
  const handleNotMigrated = new Map<string, number>();
  const productMissingHere = new Map<string, number>();
  const badRating: string[] = [];
  const perProduct = new Map<string, number>();
  let overlayHits = 0;
  let overlayDiffers = 0;

  for (const review of ru) {
    const key = String(review.id);
    const hit = matchReviewProduct(review.product);

    if (!hit) {
      const name = review.product === null ? "(нет названия товара)" : String(review.product);
      noRule.set(name, (noRule.get(name) ?? 0) + 1);
      continue;
    }

    if (!hit.handles.length) {
      const name = String(review.product);
      notSoldHere.set(name, (notSoldHere.get(name) ?? 0) + 1);
      continue;
    }

    if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5) {
      badRating.push(`${key} (rating=${String(review.rating)})`);
      continue;
    }

    for (const sourceHandle of hit.handles) {
      const target = handleToTarget.get(sourceHandle);
      if (!target?.target_id) {
        handleNotMigrated.set(sourceHandle, (handleNotMigrated.get(sourceHandle) ?? 0) + 1);
        continue;
      }
      if (!ownedProductIds.has(target.target_id)) {
        productMissingHere.set(sourceHandle, (productMissingHere.get(sourceHandle) ?? 0) + 1);
        continue;
      }

      perProduct.set(sourceHandle, (perProduct.get(sourceHandle) ?? 0) + 1);

      for (const locale of LOCALES) {
        const base = locale === "ru" ? review : enById.get(key);
        if (!base) continue;

        const edit = overlays.get(locale)?.get(key);
        if (edit?.author || edit?.text) {
          overlayHits += 1;
          if (
            (edit.author && edit.author !== base.author) ||
            (edit.text && edit.text !== base.text)
          ) {
            overlayDiffers += 1;
          }
        }

        const author = (edit?.author ?? base.author ?? "").trim();
        const body = (edit?.text ?? base.text ?? "").trim();
        if (!author || !body) continue;

        planned.push({
          product_id: target.target_id,
          source_key: `${SOURCE_PREFIX}:${key}`,
          language: locale,
          author_name: author,
          body,
          rating: review.rating,
          review_date: parseDate(review.date),
        });
      }
    }
  }

  const unmappedReviews =
    [...noRule.values()].reduce((sum, count) => sum + count, 0) +
    [...notSoldHere.values()].reduce((sum, count) => sum + count, 0) +
    [...handleNotMigrated.values()].reduce((sum, count) => sum + count, 0) +
    [...productMissingHere.values()].reduce((sum, count) => sum + count, 0) +
    badRating.length;

  // ---- what is already in the shop
  const reviewService: ProductReviewModuleService = container.resolve(PRODUCT_REVIEW_MODULE);
  const existing = (await reviewService.listProductReviews({
    tenant_id: tenant.id,
    source_key: [...new Set(planned.map((row) => row.source_key))],
  })) as { product_id: string; source_key: string | null; language: string }[];

  const existingKeys = new Set(
    existing.map((row) => `${row.product_id}|${row.source_key}|${row.language}`),
  );

  const toWrite = planned.filter(
    (row) => !existingKeys.has(`${row.product_id}|${row.source_key}|${row.language}`),
  );

  // ---- the report, always, dry run or not
  logger.info("─".repeat(72));
  logger.info(`reviews in source:        ${ru.length}`);
  logger.info(`mapped to a product:      ${[...perProduct.values()].reduce((a, b) => a + b, 0)} (review, product) pairs`);
  logger.info(`rows planned (ru + en):   ${planned.length}`);
  logger.info(`already in the shop:      ${planned.length - toWrite.length}`);
  logger.info(`to write:                 ${toWrite.length}`);
  logger.info(
    `owner edits from the old admin: ${overlayHits} rows carried one, ${overlayDiffers} differed from the file`,
  );
  logger.info("per product (reviews, both languages counted once):");
  for (const [handle, count] of [...perProduct.entries()].sort((a, b) => b[1] - a[1])) {
    logger.info(`   ${String(count).padStart(3)}  ${handle} → ${handleToTarget.get(handle)?.target_id}`);
  }

  logger.info(`unmapped reviews: ${unmappedReviews}`);
  for (const [name, count] of notSoldHere) {
    logger.info(`   ${count}  «${name}» — узнано правилом, в этом магазине не продаётся`);
  }
  for (const [name, count] of noRule) {
    logger.info(`   ${count}  «${name}» — правила для этого названия нет`);
  }
  for (const [handle, count] of handleNotMigrated) {
    logger.info(`   ${count}  ${handle} — товара нет в реестре миграции`);
  }
  for (const [handle, count] of productMissingHere) {
    logger.info(`   ${count}  ${handle} — товар есть в реестре, но не принадлежит тенанту здесь`);
  }
  if (badRating.length) {
    logger.info(`   оценка вне диапазона 1–5: ${badRating.join(", ")}`);
  }
  logger.info("─".repeat(72));

  if (dryRun) {
    logger.info("--dry-run: nothing was written.");
  } else if (!toWrite.length) {
    logger.info("Nothing to write: every planned row is already in the shop.");
  } else {
    await reviewService.createProductReviews(
      toWrite.map((row) => ({
        tenant_id: tenant.id as string,
        product_id: row.product_id,
        author_name: row.author_name,
        rating: row.rating,
        title: null,
        body: row.body,
        language: row.language,
        status: "published" as const,
        source: "imported" as const,
        customer_id: null,
        order_id: null,
        reply: null,
        replied_at: null,
        review_date: row.review_date,
        source_key: row.source_key,
      })),
    );
    logger.info(`Wrote ${toWrite.length} review rows.`);
  }

  if (unmappedReviews && !allowUnmapped) {
    logger.error(
      `${unmappedReviews} reviews could not be attached to a product in this shop (listed above). ` +
        "Read the list; pass allow-unmapped to accept it and exit 0.",
    );
    process.exit(3);
  }

  process.exit(0);
}
