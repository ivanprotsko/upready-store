import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { updateStockLocationsWorkflow } from "@medusajs/medusa/core-flows";
import { WB_WRITE_LIVE_ENV } from "../../../../modules/wb-write/write-transport";
import { batchesFor } from "../../../../wb-write-diff/push";
import { buildWbDiff } from "../../../../wb-write-diff/build";
import { readWarehouseMappings, WB_WAREHOUSE_METADATA_KEY } from "../../../../wb-write-diff/read";
import { getTenantScope } from "../../tenant-scope";
import {
  GetTenantWbWritePreviewQuery,
  type GetTenantWbWritePreviewQueryType,
  type PutTenantWbWritePreviewBodyType,
} from "./validators";

/**
 * `GET/PUT /tenants/wb/write-preview` — "что изменится на WB"
 * (w21-wb-write-stocks-prices).
 *
 * The GET is a READ of two sides: the shop's own stock and prices, and the WB
 * mirrors w01 filled. It answers with the rows, the counts over ALL of them
 * (never over the page), and the state of the gates that keep the «Отправить»
 * button disabled — so the screen can say WHY it cannot send rather than just
 * being grey.
 *
 * The PUT changes one thing, and it is not a mutation of Wildberries: which WB
 * seller warehouse a stock location of this shop stands for. It is stored on
 * the location itself (`metadata.wb_warehouse_id`) and scoped the same way
 * everything under `/tenants/*` is — to the tenant `getTenantScope` resolved
 * from the token, never to an id in the body. A location the tenant's own
 * sales channel does not reach is refused as NOT_FOUND, so one shop can never
 * repoint another's warehouse.
 *
 * Nothing here calls `wbWrite`. The batches in the answer are what a push
 * WOULD build, counted, so the owner sees the size of the operation before
 * anybody has the right to run it.
 */

/** How many rows of the diff the panel is handed. The counts always cover all of them. */
const previewState = async (
  req: AuthenticatedMedusaRequest,
  query: GetTenantWbWritePreviewQueryType,
) => {
  const tenant = await getTenantScope(req);
  const diff = await buildWbDiff(req.scope, { tenantId: tenant.id, kind: query.kind });
  const batches = batchesFor(diff);

  const visible =
    query.action === "all" ? diff.rows : diff.rows.filter((row) => row.action === query.action);

  return {
    kind: diff.kind,
    /** Every count is over the WHOLE diff; `rows` below is one page of it. */
    counts: diff.counts,
    mirror_fetched_at: diff.mirror_fetched_at,
    /**
     * What a push would build, and what it would cost: the owner's question
     * before the gates are ever opened is "how much is this".
     */
    push: {
      batches: batches.length,
      rows: batches.reduce((sum, batch) => sum + batch.rows, 0),
      endpoints: [...new Set(batches.map((batch) => batch.endpointId))],
    },
    /**
     * Why «Отправить» is disabled. Read from the same places the write core
     * reads them, never restated: `/tenants/wb/write-settings` owns the
     * switch and the consents, this says what CANNOT be changed from a screen.
     */
    gates: {
      live: {
        env_var: WB_WRITE_LIVE_ENV,
        /** `false` everywhere: no deployment of this repository sets it. */
        enabled: process.env[WB_WRITE_LIVE_ENV] === "1",
      },
    },
    warehouses: diff.warehouses,
    unmapped_locations: diff.unmapped_locations,
    locations: await readWarehouseMappings(req.scope, tenant.id),
    page: { limit: query.limit, action: query.action, shown: Math.min(visible.length, query.limit) },
    rows: visible.slice(0, query.limit),
  };
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  // Parsed here rather than in `middlewares.ts`: `validateAndTransformQuery`
  // is Medusa's LIST helper and carries `fields`/pagination semantics this
  // route does not have. The schema is still the one file that spells the
  // parameters out.
  const parsed = GetTenantWbWritePreviewQuery.safeParse(req.query ?? {});

  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
    );
  }

  res.json(await previewState(req, parsed.data));
};

export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantWbWritePreviewBodyType>,
  res: MedusaResponse,
) => {
  const tenant = await getTenantScope(req);
  const owned = await readWarehouseMappings(req.scope, tenant.id);
  const ownedIds = new Set(owned.map((row) => row.stock_location_id));

  for (const change of req.validatedBody.warehouses) {
    if (!ownedIds.has(change.stock_location_id)) {
      // A foreign id is a missing id: the answer must not tell one shop that
      // another shop's location exists (`tenant-scope.ts`).
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Stock location ${change.stock_location_id} was not found.`,
      );
    }
  }

  const byId = new Map(owned.map((row) => [row.stock_location_id, row]));

  for (const change of req.validatedBody.warehouses) {
    const current = byId.get(change.stock_location_id);
    if (current?.wb_warehouse_id === change.wb_warehouse_id) {
      continue;
    }

    await updateStockLocationsWorkflow(req.scope).run({
      input: {
        selector: { id: change.stock_location_id },
        // Medusa merges `metadata`, so the other keys on the location survive.
        // Clearing is `null`, which is what leaves the pairing absent rather
        // than keeping a stale number nobody can see (rule 20a).
        update: { metadata: { [WB_WAREHOUSE_METADATA_KEY]: change.wb_warehouse_id } },
      },
    });
  }

  // The answer is a READ-BACK of what the rows now say, not a restatement of
  // the request (rule 20a).
  res.json(
    await previewState(req, {
      kind: "stocks",
      limit: 100,
      action: "update",
    }),
  );
};
