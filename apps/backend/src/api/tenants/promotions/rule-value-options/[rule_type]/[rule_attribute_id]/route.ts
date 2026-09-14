import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type {
  ApplicationMethodTargetTypeValues,
  RuleTypeValues,
} from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { GET as adminRuleValueGET } from "@medusajs/medusa/api/admin/promotions/rule-value-options/[rule_type]/[rule_attribute_id]/route";
import {
  ruleQueryConfigurations,
  validateRuleAttribute,
  validateRuleType,
} from "@medusajs/medusa/api/admin/promotions/utils/index";
import {
  getTenantScope,
  listTenantProductIds,
  scopeIdFilter,
} from "../../../../tenant-scope";

/**
 * `GET /tenants/promotions/rule-value-options/:rule_type/:rule_attribute_id` —
 * the values a rule of that attribute may take, as `{ values: [{ label, value }],
 * count, offset, limit }`.
 *
 * Most attributes here are global reference data the storefronts already show in
 * public (regions, countries, currencies, collections, tags, types), and for those
 * the Admin's own handler answers unchanged. Two are not, and they are scoped:
 *
 * - `sales_channel`: a tenant has exactly one channel, and a promotion may name
 *   no other (`POST /tenants/promotions` forces that rule), so offering the list
 *   of every channel on the backend would be a combobox of other tenants' shops
 *   whose every entry the create route would then overwrite.
 * - `product`: the target-rule and buy-rule builders pick products by title, and
 *   the Admin's handler would list the whole catalog of every tenant. Scoped to
 *   the tenant's own products through the tenant-product link, the same set
 *   `GET /tenants/products` returns.
 *
 * The scoped branch is the Admin's non-index-engine path written out: the
 * `value` parameter is moved onto the attribute's own value column, the owned ids
 * are intersected with it, and an empty intersection answers an empty page rather
 * than an unfiltered query.
 */
const scopedValueSets: Record<
  string,
  (req: AuthenticatedMedusaRequest) => Promise<string[]>
> = {
  sales_channel: async (req) => {
    const tenant = await getTenantScope(req);

    return tenant.sales_channel_id ? [tenant.sales_channel_id] : [];
  },
  product: (req) => listTenantProductIds(req),
};

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { rule_type: ruleType, rule_attribute_id: ruleAttributeId } = req.params;
  const ownedIdsOf = scopedValueSets[ruleAttributeId];

  if (!ownedIdsOf) {
    await adminRuleValueGET(req as never, res);
    return;
  }

  validateRuleType(ruleType);

  const filterableFields = { ...req.filterableFields } as Record<string, unknown>;

  // `req.params` is typed as a bag of strings; the Admin's own validator types
  // these two as the promotion module's string unions and throws INVALID_DATA on
  // anything outside them, which is exactly what the casts hand it.
  validateRuleAttribute({
    ruleType: ruleType as RuleTypeValues,
    ruleAttributeId,
    promotionType: undefined,
    applicationMethodType: undefined,
    applicationMethodTargetType: filterableFields.application_method_target_type as
      | ApplicationMethodTargetTypeValues
      | undefined,
  });

  const queryConfig = ruleQueryConfigurations[ruleAttributeId];

  if (filterableFields.value) {
    filterableFields[queryConfig.valueAttr] = filterableFields.value;
    delete filterableFields.value;
  }

  delete filterableFields.application_method_target_type;

  const pagination = req.queryConfig.pagination;
  const ids = scopeIdFilter(await ownedIdsOf(req), filterableFields[queryConfig.valueAttr]);

  if (ids.length === 0) {
    res.json({
      values: [],
      count: 0,
      offset: pagination?.skip ?? 0,
      limit: pagination?.take ?? 0,
    });
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data, metadata } = await query.graph({
    entity: queryConfig.entryPoint,
    fields: [queryConfig.labelAttr, queryConfig.valueAttr],
    filters: { ...filterableFields, [queryConfig.valueAttr]: ids },
    pagination,
  });

  res.json({
    values: data.map((row: Record<string, unknown>) => ({
      label: row[queryConfig.labelAttr],
      value: row[queryConfig.valueAttr],
    })),
    count: metadata?.count,
    offset: metadata?.skip,
    limit: metadata?.take,
  });
};
