import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { getOrdersListWorkflow } from "@medusajs/medusa/core-flows";
import { emptyPage, listTenantOrderIds, scopeIdFilter } from "../tenant-scope";

/**
 * `GET /tenants/orders` — the orders linked to the tenant by
 * `linkOrderToTenantWorkflow`, loaded through the same `getOrdersListWorkflow`
 * the Admin uses so totals and items come back computed, and answered in the
 * Admin's list shape (`orders`, `count`, `offset`, `limit`).
 *
 * The recipe passes `vendor.orders.map(o => o.id)` straight into the filter.
 * With no linked orders that is `undefined`, and an undefined `id` filter is
 * no filter at all: the workflow would return EVERY order on the backend to a
 * tenant that has none. The early return below is the isolation guarantee.
 *
 * `is_draft_order: false` and the `filterableFields` spread mirror
 * `@medusajs/medusa/dist/api/admin/orders/route.js`.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const ownedIds = await listTenantOrderIds(req);
  const ids = scopeIdFilter(ownedIds, req.filterableFields.id);

  if (ids.length === 0) {
    res.json({ orders: [], ...emptyPage(req) });
    return;
  }

  const pagination = req.queryConfig.pagination;

  const { result } = await getOrdersListWorkflow(req.scope).run({
    input: {
      fields: req.queryConfig.fields,
      variables: {
        filters: {
          ...req.filterableFields,
          id: ids,
          is_draft_order: false,
        },
        ...pagination,
      },
    },
  });

  // The workflow returns a bare array when it is called without pagination.
  // `validateAndTransformQuery` always sets `skip`/`take`, so the paginated
  // shape is what arrives here; the array branch keeps the reader honest.
  const { rows, metadata } = Array.isArray(result)
    ? {
        rows: result,
        metadata: {
          count: result.length,
          skip: pagination?.skip ?? 0,
          take: pagination?.take ?? result.length,
        },
      }
    : result;

  res.json({
    orders: rows,
    count: metadata.count,
    offset: metadata.skip,
    limit: metadata.take,
  });
};
