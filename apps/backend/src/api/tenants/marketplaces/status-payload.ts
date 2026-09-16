import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import type { MedusaContainer } from "@medusajs/framework/types";
import type { MarketplaceAdapter } from "../../../modules/marketplace/contract";
import { MP_KINDS } from "../../../modules/marketplace/contract";
import { MARKETPLACE_MODULE } from "../../../modules/marketplace";
import type MarketplaceModuleService from "../../../modules/marketplace/service";
import { linkSummary, matchByVendorCode } from "../../../modules/marketplace/link";
import { tenantVariants } from "../../../modules/marketplace/project";

/**
 * The body of one marketplace card, built once and served by both
 * `GET /tenants/marketplaces` and
 * `GET /tenants/marketplaces/:marketplace/status` (w12-marketplace-core).
 *
 * It is assembled entirely from the adapter and the shared `mp_*` tables, so a
 * third marketplace gets the same card with no code here: the panel renders
 * whatever the registry returns.
 *
 * The key is NEVER in the response. What comes back is what the key says about
 * itself (`adapter.inspectCredentials`), the registry of reads this client is
 * allowed to send, the newest run per kind and the row counts.
 */

const asIso = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

type SyncRunRow = {
  id: string;
  kind: string;
  status: string;
  is_fixture: boolean;
  started_at: Date | string;
  finished_at: Date | string | null;
  rows: number;
  requests: number;
  error: string | null;
};

export type MarketplaceCard = Awaited<ReturnType<typeof buildCard>>;

export const buildCard = async (
  scope: MedusaContainer,
  adapter: MarketplaceAdapter,
  tenantId: string,
  options: { withCredentials?: boolean } = {},
) => {
  const pg = scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const mp = scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE);

  const slot = await adapter.readCredentials(pg, tenantId);

  /**
   * Asking the key what it may do costs a network request on Ozon and nothing
   * on WB. The list route therefore does not ask — it says «не спрошено» — and
   * the detail route does. A cached answer would age, and the question the
   * card exists to answer is "what can this key do RIGHT NOW".
   */
  const facts = options.withCredentials
    ? await adapter.inspectCredentials(slot?.credentials ?? null)
    : null;

  const filter = { tenant_id: tenantId, marketplace: adapter.id };

  const runs = (await mp.listMpSyncRuns(filter, {
    order: { started_at: "DESC" },
    take: 200,
  })) as SyncRunRow[];

  /** The newest run per kind: "when did this last come in". */
  const latest = new Map<string, SyncRunRow>();
  for (const run of runs) {
    if (!latest.has(run.kind)) {
      latest.set(run.kind, run);
    }
  }

  const [products, offers, orders, reviews, questions, links] = await Promise.all([
    mp.listMpProducts(filter) as Promise<Record<string, unknown>[]>,
    mp.listMpOffers(filter) as Promise<Record<string, unknown>[]>,
    mp.listMpOrders(filter) as Promise<Record<string, unknown>[]>,
    mp.listMpReviews(filter) as Promise<Record<string, unknown>[]>,
    mp.listMpQuestions(filter) as Promise<Record<string, unknown>[]>,
    mp.listMpLinks(filter) as Promise<Record<string, unknown>[]>,
  ]);

  /**
   * The matching numbers, recomputed from the rows the panel is about to show
   * rather than read off a counter somebody kept. Zero links with a non-empty
   * card list is stated as a failure of setup, never as an empty screen
   * (spec 2.4).
   */
  const report = matchByVendorCode(
    products.map((row) => ({
      external_id: String(row.external_id),
      vendor_code: row.vendor_code ? String(row.vendor_code) : null,
    })),
    await tenantVariants({ container: scope, tenantId }),
  );

  return {
    id: adapter.id,
    label: adapter.label,
    connection: {
      key: { set: Boolean(slot), last4: slot?.last4 ?? null },
      is_enabled: slot?.isEnabled ?? false,
    },
    credentials: facts
      ? {
          expires_at: facts.expiresAt,
          expired: facts.expired,
          expires_in_days: facts.expiresInDays,
          expiring_soon: facts.expiringSoon,
          read_only: facts.readOnly,
          read_only_source: facts.readOnlySource,
          scopes: facts.scopes,
          raw: facts.raw,
          error: facts.error,
        }
      : null,
    endpoints: adapter.endpoints.map((endpoint) => ({
      id: endpoint.id,
      method: endpoint.method,
      host: endpoint.host,
      path: endpoint.path,
      summary: endpoint.summary,
      doc_url: endpoint.docUrl,
      read_via_post: endpoint.readViaPost?.reason ?? null,
    })),
    /**
     * What the documentation calls a write on this marketplace, shown so the
     * owner sees WHAT this client is checked against instead of being asked to
     * trust the word "только чтение".
     */
    denied: adapter.mutationDenyList.map((entry) => ({
      method: entry.method,
      path: entry.path,
      summary: entry.summary,
      doc_url: entry.docUrl,
    })),
    sync: [...adapter.syncKinds, "projection"].map((kind) => {
      const run = latest.get(kind);
      return {
        kind,
        status: run?.status ?? null,
        is_fixture: run?.is_fixture ?? null,
        started_at: asIso(run?.started_at),
        finished_at: asIso(run?.finished_at ?? null),
        rows: run ? Number(run.rows) : null,
        requests: run ? Number(run.requests) : null,
        error: run?.error ?? null,
      };
    }),
    normalized: {
      products: products.length,
      offers: offers.length,
      orders: orders.length,
      reviews: reviews.length,
      questions: questions.length,
    },
    /** Which normalized kinds this adapter fills at all. WB has no questions. */
    kinds: MP_KINDS,
    /**
     * The three buckets, recomputed from the cards and the shop's own variants
     * — the same inputs and the same matcher the projector uses, so the screen
     * cannot disagree with the database. `stored` is what `mp_link` actually
     * holds, shown next to it: if the two differ, the projector has not run
     * since the catalog changed, and that is a fact worth seeing rather than
     * hiding behind whichever number looks better.
     */
    linking: {
      total: report.total,
      linked: report.linked.length,
      not_found: report.notFound.length,
      needs_choice: report.ambiguous.length,
      accounted_for: report.accountedFor,
      stored: links.length,
      summary: linkSummary(report),
      needs_choice_cards: report.ambiguous.map((entry) => ({
        external_id: entry.external_id,
        vendor_code: (entry as { vendor_code: string }).vendor_code,
        variant_ids: (entry as { variant_ids: string[] }).variant_ids,
      })),
    },
  };
};
