import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type {
  MarketplaceAdapter,
  MpKind,
  MpOfferDraft,
  MpOrderDraft,
  MpProductDraft,
  MpQuestionDraft,
  MpReviewDraft,
  SyncDeps,
} from "./contract";
import { MP_KINDS } from "./contract";
import { MARKETPLACE_MODULE } from "./index";
import { matchByVendorCode, linkSummary, type LinkReport } from "./link";
import { requireAdapter } from "./registry";
import type MarketplaceModuleService from "./service";

/**
 * Raw mirrors -> the normalized `mp_*` layer (w12-marketplace-core, spec 2.3).
 *
 * IDEMPOTENT BY CONSTRUCTION. Every table is keyed on an identity the
 * marketplace itself owns — `(tenant_id, marketplace, external_id)`, or the
 * derived `offer_key` / `line_key` where one identifier is not enough — so a
 * second run updates the same rows instead of adding a second set. The PR
 * shows two runs with identical counts rather than claiming it.
 *
 * It spends no request. Everything it reads is already in `wb_*` / `ozon_*`,
 * which is exactly why the raw mirrors are kept: a normalisation found wrong
 * later is recomputed here, not re-imported (spec 2.1).
 *
 * The run itself is a row in `mp_sync_run` with `kind = 'projection'`. A run
 * that fails leaves a `failed` row with its message: a projection that did not
 * happen has to be visible, or an empty normalized layer reads as "the
 * marketplace had nothing" (rule 20a).
 */

export type ProjectionCounts = Record<MpKind | "order_lines" | "links", number>;

export type ProjectionResult = {
  tenantId: string;
  marketplace: string;
  runId: string;
  status: "succeeded" | "failed";
  counts: ProjectionCounts;
  link: LinkReport;
  linkSummary: string;
  error: string | null;
};

type Row = Record<string, unknown> & { id: string };

/** See the comment at the single cast site in `projectFromMirrors`. */
type JsonColumnRow = Parameters<MarketplaceModuleService["createMpProducts"]>[0][number];

type Deps = {
  container: SyncDeps["container"];
  tenantId: string;
  logger?: Pick<Console, "info" | "warn" | "error">;
};

const service = (deps: Deps): MarketplaceModuleService =>
  deps.container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);

/**
 * Writes a set of drafts into one table, keyed by `keyOf`.
 *
 * Rows that exist are UPDATED, rows that do not are CREATED, and rows that the
 * mirrors no longer produce are left alone: a card withdrawn from the
 * marketplace is a fact worth keeping, and deleting it here would silently
 * shrink the owner's history. Deleting it is a separate decision with its own
 * screen, not a side effect of a projection.
 */
const upsert = async <T extends Record<string, unknown>>(
  existing: Row[],
  drafts: T[],
  keyOf: (row: Record<string, unknown>) => string,
  create: (rows: T[]) => Promise<unknown>,
  update: (rows: (T & { id: string })[]) => Promise<unknown>,
): Promise<number> => {
  const byKey = new Map(existing.map((row) => [keyOf(row), row.id]));

  const toCreate: T[] = [];
  const toUpdate: (T & { id: string })[] = [];

  for (const draft of drafts) {
    const id = byKey.get(keyOf(draft));
    if (id) {
      toUpdate.push({ ...draft, id });
    } else {
      toCreate.push(draft);
    }
  }

  if (toCreate.length) {
    await create(toCreate);
  }
  if (toUpdate.length) {
    await update(toUpdate);
  }

  return toCreate.length + toUpdate.length;
};

const identity = (row: Record<string, unknown>): string =>
  `${row.tenant_id}|${row.marketplace}|${row.external_id}`;

/** Every variant of every product this tenant owns, with its SKU. */
const tenantVariants = async (deps: Deps) => {
  const query = deps.container.resolve<{
    graph: (input: unknown) => Promise<{ data: Record<string, unknown>[] }>;
  }>(ContainerRegistrationKeys.QUERY);

  const { data } = await query.graph({
    entity: "tenant",
    fields: ["id", "products.id", "products.variants.id", "products.variants.sku"],
    filters: { id: [deps.tenantId] },
  });

  const tenant = data?.[0] as
    | { products?: { id: string; variants?: { id: string; sku: string | null }[] }[] }
    | undefined;

  return (tenant?.products ?? []).flatMap((product) =>
    (product.variants ?? []).map((variant) => ({
      id: variant.id,
      product_id: product.id,
      sku: variant.sku ?? null,
    })),
  );
};

/**
 * Recomputes the whole normalized layer of one marketplace for one shop.
 *
 * `marketplace` is resolved through `registry.ts`, so this function knows
 * nothing about Wildberries or Ozon and a third adapter needs no line here.
 */
export const projectFromMirrors = async (
  deps: Deps,
  marketplace: string,
): Promise<ProjectionResult> => {
  const adapter: MarketplaceAdapter = requireAdapter(marketplace);
  const mp = service(deps);
  const logger = deps.logger ?? console;
  const startedAt = new Date();

  const run = (await mp.createMpSyncRuns({
    tenant_id: deps.tenantId,
    marketplace: adapter.id,
    kind: "projection",
    status: "running",
    started_at: startedAt,
    rows: 0,
    requests: 0,
  })) as { id: string };

  const counts: ProjectionCounts = {
    products: 0,
    offers: 0,
    orders: 0,
    reviews: 0,
    questions: 0,
    order_lines: 0,
    links: 0,
  };

  let report: LinkReport = {
    total: 0,
    linked: [],
    notFound: [],
    ambiguous: [],
    accountedFor: 0,
  };

  try {
    const syncDeps: SyncDeps = {
      container: deps.container,
      tenantId: deps.tenantId,
      credentials: null,
      logger,
    };

    const scope = { tenant_id: deps.tenantId, marketplace: adapter.id };

    for (const kind of MP_KINDS) {
      const rows = await adapter.loadMirror(syncDeps, kind as MpKind);
      const drafts = adapter.normalize[kind](rows);

      if (kind === "products") {
        counts.products = await upsert(
          (await mp.listMpProducts(scope)) as Row[],
          drafts as MpProductDraft[],
          identity,
          /**
           * The cast is here and nowhere else. Medusa generates the type of a
           * `model.json()` column as `Record<string, unknown>`, while `jsonb`
           * holds an array just as happily — and WB's `photos` IS an array.
           * Bending the draft to fit a type narrower than the column would
           * change the data to please the compiler, so the narrowing is
           * refused in one named place instead.
           */
          (created) => mp.createMpProducts(created as unknown as JsonColumnRow[]),
          (updated) => mp.updateMpProducts(updated as unknown as JsonColumnRow[]),
        );
        continue;
      }

      if (kind === "offers") {
        counts.offers = await upsert(
          (await mp.listMpOffers(scope)) as Row[],
          drafts as MpOfferDraft[],
          (row) => `${row.tenant_id}|${row.marketplace}|${row.offer_key}`,
          (created) => mp.createMpOffers(created),
          (updated) => mp.updateMpOffers(updated),
        );
        continue;
      }

      if (kind === "orders") {
        const orders = drafts as MpOrderDraft[];
        counts.orders = await upsert(
          (await mp.listMpOrders(scope)) as Row[],
          orders.map(({ lines: _lines, ...order }) => order),
          identity,
          (created) => mp.createMpOrders(created),
          (updated) => mp.updateMpOrders(updated),
        );

        /**
         * Lines are written after their orders, because a line names the
         * `mp_order.id` of its owner and that id only exists once the order
         * row does.
         */
        const stored = (await mp.listMpOrders(scope)) as Row[];
        const orderIdByExternal = new Map(stored.map((row) => [String(row.external_id), row.id]));

        const lineDrafts = orders.flatMap((order) => {
          const orderId = orderIdByExternal.get(order.external_id);
          if (!orderId) {
            return [];
          }
          return order.lines.map((line) => ({
            tenant_id: order.tenant_id,
            marketplace: order.marketplace,
            order_id: orderId,
            line_key: line.line_key,
            vendor_code: line.vendor_code,
            external_id: line.external_id,
            qty: line.qty,
            price: line.price,
            discount: line.discount,
            source_row_id: order.source_row_id,
            synced_at: order.synced_at,
          }));
        });

        counts.order_lines = await upsert(
          (await mp.listMpOrderLines(scope)) as Row[],
          lineDrafts,
          (row) => `${row.tenant_id}|${row.marketplace}|${row.line_key}`,
          (created) => mp.createMpOrderLines(created),
          (updated) => mp.updateMpOrderLines(updated),
        );
        continue;
      }

      if (kind === "reviews") {
        counts.reviews = await upsert(
          (await mp.listMpReviews(scope)) as Row[],
          (drafts as MpReviewDraft[]).map(({ created_at, ...review }) => ({
            ...review,
            created_at_mp: created_at,
          })),
          identity,
          (created) => mp.createMpReviews(created),
          (updated) => mp.updateMpReviews(updated),
        );
        continue;
      }

      counts.questions = await upsert(
        (await mp.listMpQuestions(scope)) as Row[],
        (drafts as MpQuestionDraft[]).map(({ created_at, ...question }) => ({
          ...question,
          created_at_mp: created_at,
        })),
        identity,
        (created) => mp.createMpQuestions(created),
        (updated) => mp.updateMpQuestions(updated),
      );
    }

    /* The catalog match. One matcher, both marketplaces (spec 2.4). */
    const cards = ((await mp.listMpProducts(scope)) as Row[]).map((row) => ({
      external_id: String(row.external_id),
      vendor_code: row.vendor_code ? String(row.vendor_code) : null,
    }));
    report = matchByVendorCode(cards, await tenantVariants(deps));

    const linkedAt = new Date();
    counts.links = await upsert(
      (await mp.listMpLinks(scope)) as Row[],
      report.linked.map((outcome) => ({
        tenant_id: deps.tenantId,
        marketplace: adapter.id,
        external_id: outcome.external_id,
        product_id: (outcome as { product_id: string }).product_id,
        variant_id: (outcome as { variant_id: string }).variant_id,
        matched_by: "vendor_code",
        confidence: 1,
        linked_at: linkedAt,
      })),
      identity,
      (created) => mp.createMpLinks(created),
      (updated) => mp.updateMpLinks(updated),
    );

    const rows = Object.values(counts).reduce((sum, value) => sum + value, 0);

    await mp.updateMpSyncRuns([
      {
        id: run.id,
        status: "succeeded",
        finished_at: new Date(),
        rows,
        /** A projection spends no request; a zero here is the truth, not a gap. */
        requests: 0,
      },
    ]);

    logger.info(
      `[marketplace] projection ${adapter.id} / ${deps.tenantId}: ${rows} rows. ` +
        linkSummary(report),
    );

    return {
      tenantId: deps.tenantId,
      marketplace: adapter.id,
      runId: run.id,
      status: "succeeded",
      counts,
      link: report,
      linkSummary: linkSummary(report),
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await mp.updateMpSyncRuns([
      { id: run.id, status: "failed", finished_at: new Date(), error: message },
    ]);
    logger.error(`[marketplace] projection ${adapter.id} / ${deps.tenantId} failed: ${message}`);

    return {
      tenantId: deps.tenantId,
      marketplace: adapter.id,
      runId: run.id,
      status: "failed",
      counts,
      link: report,
      linkSummary: linkSummary(report),
      error: message,
    };
  }
};
