import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace";
import type { MarketplaceAdapter } from "../../../../../modules/marketplace/contract";
import {
  buildProductResolver,
  sendingReason,
  toDeskItem,
  type DeskKind,
  type DeskRow,
} from "../../../../../modules/marketplace/desk";
import { describeGenerator } from "../../../../../modules/marketplace/draft-generator";
import { connectionNotice, resolvePage, type ConnectionNotice } from "../../../../../modules/marketplace/order-feed";
import { resolveMpReviewsQuery, selectMpReviews } from "../../../../../modules/marketplace/reviews-list";
import type MarketplaceModuleService from "../../../../../modules/marketplace/service";
import { getTenantScope } from "../../../tenant-scope";
import { marketplaceOf } from "../orders/load-orders";

/**
 * `GET /tenants/marketplaces/:marketplace/reviews` — the reviews and questions
 * of one marketplace in one list («Wildberries → Отзывы», mp-section-design
 * task-05; the contract is `MpReviewsResponse` in the panel's
 * `hooks/api/marketplace-section.tsx`).
 *
 * READ-ONLY. This handler reads `mp_review`, `mp_question`, the run log and
 * whether a key is saved; it calls no adapter network member and names no
 * endpoint (Ivan, 2026-09-16 02:46 WITA). The one write of the screen, the
 * draft, is the existing `POST /tenants/marketplaces/{reviews|questions}/:id/draft`
 * into our own database. `__tests__/reviews-desk-read-only.unit.spec.ts`
 * fails if that stops being true.
 *
 * The query, all optional and all in the panel's address: `limit` / `offset`
 * (20 by default, 200 at most), `q` (text, buyer, product), `kind`
 * (`reviews,questions`), `rating` (`1..5`, a list), `answered` (`yes|no`, the
 * marketplace's own flag), `created_at` (`{"$gte":"…","$lte":"…"}`), `order`
 * (`created_at | rating`, `-` for descending, `-created_at` by default).
 *
 * What the answer carries besides the rows, and why each is there:
 *   `counts`      reviews and questions, total and unanswered, counted BEFORE
 *                 the filters, for the line under the heading.
 *   `generator`   whether «Сгенерировать» may be pressed, and why not.
 *   `sending`     why there is no «отправить», the same sentence the screen
 *                 prints, so the API and the owner are told one thing.
 *   `connection`  whether the shop has a key, how the last review import
 *                 ended and when one last succeeded: an empty list has
 *                 different causes and the screen names the one it has
 *                 (rule 20a).
 */

/** The run of one import, as the screen may need to name it. */
type RunView = {
  kind: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  rows: number | null;
  error: string | null;
  is_fixture: boolean;
};

export type ReviewsConnection = {
  marketplace: string;
  label: string;
  /** False when the shop has no key for this marketplace. */
  connected: boolean;
  /** The newest import of reviews or questions, whatever its outcome. */
  last_run: RunView | null;
  /** When an import of REVIEWS (WB `feedbacks`, Ozon `reviews`) last ended `succeeded`. */
  last_success_at: string | null;
  notice: ConnectionNotice | null;
};

const iso = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  const at = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

const runView = (run: Record<string, unknown>): RunView => ({
  kind: String(run.kind),
  status: String(run.status),
  started_at: iso(run.started_at),
  finished_at: iso(run.finished_at),
  rows: run.rows === null || run.rows === undefined ? null : Number(run.rows),
  error: (run.error ?? null) as string | null,
  is_fixture: Boolean(run.is_fixture),
});

const readConnection = async (
  req: AuthenticatedMedusaRequest,
  mp: MarketplaceModuleService,
  adapter: MarketplaceAdapter,
  tenantId: string,
): Promise<ReviewsConnection> => {
  const pg = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const slot = await adapter.readCredentials(pg, tenantId);

  /** The import kinds behind the two tables, in the adapter's own vocabulary. */
  const reviewKinds = [...adapter.mirrorKinds.reviews];
  const kinds = [...reviewKinds, ...adapter.mirrorKinds.questions];

  const [newest] = kinds.length
    ? ((await mp.listMpSyncRuns(
        { tenant_id: tenantId, marketplace: adapter.id, kind: kinds },
        { order: { started_at: "DESC" }, take: 1 },
      )) as Record<string, unknown>[])
    : [];
  const [succeeded] = reviewKinds.length
    ? ((await mp.listMpSyncRuns(
        { tenant_id: tenantId, marketplace: adapter.id, kind: reviewKinds, status: "succeeded" },
        { order: { started_at: "DESC" }, take: 1 },
      )) as Record<string, unknown>[])
    : [];

  const lastRun = newest ? runView(newest) : null;
  const connected = Boolean(slot?.credentials);

  return {
    marketplace: adapter.id,
    label: adapter.label,
    connected,
    last_run: lastRun,
    last_success_at: iso(succeeded?.finished_at),
    notice: connectionNotice({ connected, last_run: lastRun }),
  };
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const adapter = marketplaceOf(req);
  /** Read before the tenant, so a malformed filter answers 400 without a database round trip. */
  const query = resolveMpReviewsQuery(req.query as Record<string, unknown>);
  const { limit, offset } = resolvePage(req.query as Record<string, unknown>);
  const tenant = await getTenantScope(req);
  const mp = req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);

  /**
   * The tenant and the marketplace are part of the FILTER: another shop's rows
   * and the other marketplace's rows are never read, so they cannot leak into
   * the list or into the counts.
   */
  const scope = { tenant_id: tenant.id, marketplace: adapter.id };
  const [reviews, questions, resolve] = await Promise.all([
    mp.listMpReviews(scope) as Promise<DeskRow[]>,
    mp.listMpQuestions(scope) as Promise<DeskRow[]>,
    buildProductResolver(req.scope, mp, tenant.id),
  ]);

  const toItems = (rows: DeskRow[], kind: DeskKind) =>
    rows.map((row) => toDeskItem(row, kind, resolve(row.marketplace, row.vendor_code ?? null)));
  const selection = selectMpReviews(
    [...toItems(reviews, "reviews"), ...toItems(questions, "questions")],
    query,
  );

  res.json({
    items: selection.rows.slice(offset, offset + limit),
    count: selection.rows.length,
    limit,
    offset,
    counts: selection.counts,
    generator: describeGenerator(),
    sending: { enabled: false, reason: sendingReason(adapter.label) },
    connection: await readConnection(req, mp, adapter, tenant.id),
  });
};
