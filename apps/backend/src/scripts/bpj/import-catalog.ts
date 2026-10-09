import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows";
import { readFileSync } from "node:fs";
import { PRODUCT_REFERENCE, upsertTranslationFields } from "../../api/tenants/products/translations-helpers";
import type { SeedPlan, SeedPlanCategory } from "../../migration-scripts/data/abstract-datasets";
import { fetchImage } from "../../product-csv/images";
import { notifyStorefrontRevalidate } from "../../storefront-revalidate";
import { tenantFilePrefix } from "../../tenant-files";
import seedTenantDatasetWorkflow, { type SeedTenantDatasetWorkflowInput } from "../../workflows/tenant/seed-tenant-dataset";
import { countBpjPlan, formatCounts, type BpjImportPlan, type BpjTranslation } from "./catalog";

/**
 * Writes a Beauty Pro Japan plan (`convert-catalog.ts`) into one shop (t-2026-10-06-09):
 *
 *   npx medusa exec ./src/scripts/bpj/import-catalog.ts tenant=<shop handle> plan=<plan.json> [dry-run]
 *   TENANT_HANDLE=<shop handle> BPJ_PLAN=<plan.json> DRY_RUN=true npx medusa exec ./src/scripts/bpj/import-catalog.ts
 *
 * The arguments carry no leading dashes because `medusa exec` parses the command line
 * itself and swallows a leading `--` (apps/backend/README.md, measured on the Medusa CLI
 * 2.19): a dashed `--dry-run` can reach this script as nothing at all and the run goes
 * for real. `dry-run` and `DRY_RUN=true` are the forms that work; `--dry-run` is accepted
 * too, in case it gets through.
 *
 * The products, categories and links go in through `seedTenantDatasetWorkflow`, the one
 * the onboarding wizard runs, so a failure half-way compensates every row. The English
 * texts follow through `upsertTranslationFields`, the writer of the panel's «Переводы».
 *
 * A shop that already has a product is refused, `dry-run` included: a second copy of the
 * catalog next to the first one is the duplicate nobody wants. `dry-run` prints numbers
 * only and writes nothing.
 *
 * Every picture is copied into the shop's own storage before the products are written,
 * the way the panel's CSV import does it (`product-csv/apply.ts`, `resolveImages`). The
 * plan names the old site's CDN (`static.tildacdn.one`), and the storefront's next/image
 * serves only the hosts in its `remotePatterns`: left as they were, all 495 pictures came
 * out broken on the B2 stand (t-2026-10-06-09). A picture that cannot be fetched is left
 * out of its product and named in the log.
 */

export const IMPORT_USAGE =
  "usage: npx medusa exec ./src/scripts/bpj/import-catalog.ts tenant=<shop handle> plan=<plan.json> [dry-run]";

export type ImportArgs = { tenantHandle: string | null; planPath: string | null; dryRun: boolean };

export const parseImportArgs = (argv: string[], env: NodeJS.ProcessEnv = process.env): ImportArgs => {
  const args: ImportArgs = {
    tenantHandle: env.TENANT_HANDLE || null,
    planPath: env.BPJ_PLAN || null,
    dryRun: env.DRY_RUN === "true",
  };
  for (const arg of argv) {
    if (arg === "dry-run" || arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("tenant=")) args.tenantHandle = arg.slice("tenant=".length) || null;
    else if (arg.startsWith("plan=")) args.planPath = arg.slice("plan=".length) || null;
  }
  return args;
};

export type ImportShop = {
  id: string;
  handle: string;
  sales_channel_id: string | null;
  productCount: number;
  categoryCount: number;
};

export type StoredImage = { ok: true; url: string } | { ok: false; error: string };

/** Every picture address the plan names (products, their thumbnails, the categories), once each. */
export const planImageUrls = (seed: SeedPlan): string[] => {
  const urls = new Set<string>();
  const walk = (categories: SeedPlanCategory[]) => {
    for (const category of categories) {
      if (category.metadata.image_url) urls.add(category.metadata.image_url);
      walk(category.children);
    }
  };
  for (const product of seed.products) {
    for (const image of product.images) urls.add(image);
    if (product.thumbnail) urls.add(product.thumbnail);
  }
  walk(seed.categories);
  return [...urls];
};

/**
 * The plan with each picture swapped for its copy in the shop's storage. A picture with
 * no copy is left out of its product, whose thumbnail then becomes the first picture
 * left. A category whose own picture has no copy takes the first copied picture of one
 * of its products, then of its first child, so a brand tile never points at the old CDN.
 */
export const withStoredImages = (seed: SeedPlan, stored: ReadonlyMap<string, string>): SeedPlan => {
  const products = seed.products.map((product) => {
    const images = product.images.flatMap((image) => (stored.has(image) ? [stored.get(image) as string] : []));
    const thumbnail = (product.thumbnail && stored.get(product.thumbnail)) || images[0];
    const next = { ...product, images };
    if (thumbnail) next.thumbnail = thumbnail;
    else delete next.thumbnail;
    return next;
  });
  const firstImageOf = (sourceHandle: string) =>
    products.find((product) => product.categorySourceHandle === sourceHandle && product.images[0])?.images[0];
  const categoriesOf = (categories: SeedPlanCategory[]): SeedPlanCategory[] =>
    categories.map((category) => {
      const children = categoriesOf(category.children);
      const image_url =
        stored.get(category.metadata.image_url) ??
        firstImageOf(category.sourceHandle) ??
        children[0]?.metadata.image_url ??
        "";
      return { ...category, metadata: { ...category.metadata, image_url }, children };
    });
  return { ...seed, products, categories: categoriesOf(seed.categories) };
};

/** Everything the import touches outside its own memory, so a test can stand in for it. */
export type ImportDeps = {
  findShop: (handle: string) => Promise<ImportShop | null>;
  findShippingProfileId: () => Promise<string | null>;
  /** Fetches one picture and stores it as the shop's own public file. */
  storeImage: (url: string, index: number, tenantId: string) => Promise<StoredImage>;
  seed: (input: SeedTenantDatasetWorkflowInput) => Promise<{ product_ids: string[]; category_ids: string[] }>;
  findProductIdsByHandle: (handles: string[]) => Promise<Map<string, string>>;
  writeTranslation: (productId: string, locale: string, fields: Omit<BpjTranslation, "handle">) => Promise<void>;
  revalidate: (shopHandle: string) => Promise<void>;
  info: (line: string) => void;
  error: (line: string) => void;
};

/** The import itself; answers the exit code. */
export const runBpjImport = async (
  plan: BpjImportPlan,
  { tenantHandle, dryRun }: { tenantHandle: string; dryRun: boolean },
  deps: ImportDeps,
): Promise<number> => {
  const say = (line: string) => deps.info(`bpj import: ${line}`);
  const refuse = (line: string) => {
    deps.error(`bpj import: ${line}`);
    return 1;
  };

  if (plan?.format !== "bpj-import-plan@1") {
    return refuse(`the plan is not a bpj-import-plan@1 (format ${JSON.stringify(plan?.format)}); build it with convert-catalog.ts.`);
  }
  if (plan.seed.tenantHandle !== tenantHandle) {
    return refuse(`the plan was built for shop "${plan.seed.tenantHandle}", not "${tenantHandle}": its handles carry that shop's suffix. Convert again with --tenant ${tenantHandle}.`);
  }

  const shop = await deps.findShop(tenantHandle);
  if (!shop) return refuse(`no shop with handle "${tenantHandle}" on this backend.`);

  const counts = countBpjPlan(plan, plan.counts?.droppedEditions ?? 0);
  say(`${dryRun ? "dry-run, nothing is written. " : ""}plan for "${tenantHandle}" in ${plan.currency} at ${plan.rateFromJpy} per yen`);
  for (const line of formatCounts(counts)) say(line);
  say(`the shop has products ${shop.productCount}, categories ${shop.categoryCount}`);

  if (shop.productCount > 0) {
    return refuse(`shop "${tenantHandle}" already has ${shop.productCount} product(s); the import is for a shop without products, so nothing is written.`);
  }
  if (!shop.sales_channel_id) return refuse(`shop "${tenantHandle}" has no sales channel to sell in.`);

  const urls = planImageUrls(plan.seed);
  const hostOf = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  };
  const hosts = [...new Set(urls.map(hostOf))];
  say(`pictures to copy into the shop's storage ${urls.length}, from ${hosts.join(", ") || "nowhere"}`);
  if (dryRun) return 0;

  const shippingProfileId = await deps.findShippingProfileId();
  if (!shippingProfileId) return refuse("no shipping profile exists, so no product can be created.");

  const stored = new Map<string, string>();
  for (const [index, url] of urls.entries()) {
    const outcome = await deps.storeImage(url, index, shop.id);
    if (outcome.ok) stored.set(url, outcome.url);
    else deps.error(`bpj import: picture left out, ${outcome.error}: ${url}`);
    if ((index + 1) % 50 === 0) say(`pictures copied ${stored.size} of ${index + 1}`);
  }
  say(`pictures copied into the shop's storage ${stored.size} of ${urls.length}`);

  const result = await deps.seed({
    tenant_id: shop.id,
    sales_channel_id: shop.sales_channel_id,
    shipping_profile_id: shippingProfileId,
    plan: withStoredImages(plan.seed, stored),
  });
  say(`written: categories ${result.category_ids.length}, products ${result.product_ids.length}`);

  const translations = plan.translations.products;
  const ids = translations.length ? await deps.findProductIdsByHandle(translations.map((t) => t.handle)) : new Map<string, string>();
  let written = 0;
  for (const { handle, ...fields } of translations) {
    const productId = ids.get(handle);
    if (!productId) continue;
    await deps.writeTranslation(productId, plan.translations.locale, fields);
    written += 1;
  }
  if (written) await deps.revalidate(tenantHandle);
  say(`english translations written ${written} of ${translations.length}`);

  if (written !== translations.length) {
    return refuse(`${translations.length - written} translation(s) name a product the shop does not have after the import.`);
  }
  return 0;
};

export default async function importBpjCatalog({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const parsed = parseImportArgs(args ?? []);

  if (!parsed.tenantHandle || !parsed.planPath) {
    logger.error(`bpj import: ${IMPORT_USAGE}`);
    process.exitCode = 1;
    return;
  }

  const plan = JSON.parse(readFileSync(parsed.planPath, "utf8")) as BpjImportPlan;

  const deps: ImportDeps = {
    findShop: async (handle) => {
      const {
        data: [tenant],
      } = await query.graph({
        entity: "tenant",
        fields: ["id", "handle", "sales_channel.id", "products.id", "product_categories.id"],
        filters: { handle },
      });
      if (!tenant?.id) return null;
      const row = tenant as unknown as {
        id: string;
        handle: string;
        sales_channel?: { id?: string | null } | null;
        products?: unknown[] | null;
        product_categories?: unknown[] | null;
      };
      return {
        id: row.id,
        handle: row.handle,
        sales_channel_id: row.sales_channel?.id ?? null,
        productCount: (row.products ?? []).filter(Boolean).length,
        categoryCount: (row.product_categories ?? []).filter(Boolean).length,
      };
    },
    findShippingProfileId: async () => {
      const {
        data: [profile],
      } = await query.graph({ entity: "shipping_profile", fields: ["id"] });
      return (profile?.id as string | undefined) ?? null;
    },
    storeImage: async (url, index, tenantId) => {
      const fetched = await fetchImage(url, index);
      if (!fetched.ok) return { ok: false, error: fetched.error };
      // The old site names many files alike (`IMG_3085.JPG` under different folders); the
      // number keeps each copy's name its own whatever the storage adds to it.
      const { result } = await uploadFilesWorkflow(container).run({
        input: {
          files: [
            {
              filename: `${tenantFilePrefix(tenantId)}bpj-${index + 1}-${fetched.filename}`,
              mimeType: fetched.mime_type,
              content: fetched.content.toString("base64"),
              access: "public" as const,
            },
          ],
        },
      });
      const storedUrl = result[0]?.url;
      return storedUrl ? { ok: true, url: storedUrl } : { ok: false, error: "the file storage gave no address" };
    },
    seed: async (input) => (await seedTenantDatasetWorkflow(container).run({ input })).result,
    findProductIdsByHandle: async (handles) => {
      const { data } = await query.graph({ entity: "product", fields: ["id", "handle"], filters: { handle: handles } });
      return new Map((data as { id: string; handle: string }[]).map((product) => [product.handle, product.id]));
    },
    writeTranslation: (productId, locale, fields) => upsertTranslationFields(container, PRODUCT_REFERENCE, productId, locale, fields),
    revalidate: async (shopHandle) => {
      await notifyStorefrontRevalidate({ type: "translation.updated", handle: shopHandle });
    },
    info: (line) => logger.info(line),
    error: (line) => logger.error(line),
  };

  process.exitCode = await runBpjImport(plan, { tenantHandle: parsed.tenantHandle, dryRun: parsed.dryRun }, deps);
}
