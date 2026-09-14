import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import type {
  CreatePromotionRuleDTO,
  UpdatePromotionRuleDTO,
} from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
  type RuleType,
} from "@medusajs/framework/utils";
import { getTenantScope, type TenantScope } from "../tenant-scope";

/**
 * The rule attribute that confines a tenant's promotion to the tenant's own
 * sales channel. Measured on this backend rather than assumed
 * (`GET /admin/promotions/rule-attribute-options/rules`, 2026-09-11 on :9032):
 *
 *   sales_channel -> value="sales_channel_id" label="Sales Channel" field_type=multiselect
 *
 * `value` is what goes into a rule's `attribute`; `id` (`sales_channel`) is the
 * path segment of `rule-value-options/:rule_type/:rule_attribute_id`.
 */
export const TENANT_CHANNEL_RULE_ATTRIBUTE = "sales_channel_id";

/** The `rule_attribute_id` of the same attribute, used by the value-options route. */
export const TENANT_CHANNEL_RULE_ATTRIBUTE_ID = "sales_channel";

export type PromotionRuleInput = {
  attribute: string;
  operator: string;
  values: string | string[];
  description?: string | null;
};

/**
 * The tenant behind the token, with its sales channel proven to exist. Every
 * promotion the tenant creates carries a `sales_channel_id` rule naming this
 * channel, so a tenant whose channel link is gone cannot create one at all:
 * a promotion without that rule would apply to every cart on the backend,
 * including other tenants' storefronts.
 */
export const requireTenantChannel = async (
  req: AuthenticatedMedusaRequest,
): Promise<TenantScope & { sales_channel_id: string }> => {
  const tenant = await getTenantScope(req);

  if (!tenant.sales_channel_id) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Tenant ${tenant.id} has no sales channel, so a promotion cannot be scoped to it. ` +
        "Restore the tenant's sales channel before creating promotions.",
    );
  }

  return tenant as TenantScope & { sales_channel_id: string };
};

/**
 * The rule list a tenant promotion is created with: whatever the caller asked
 * for, minus any `sales_channel_id` rule of their own, plus ours. A body naming
 * another tenant's channel is not an error and not honoured either, the same
 * way `POST /tenants/products` silently replaces `sales_channels`.
 */
export const forceChannelRule = (
  rules: PromotionRuleInput[] | undefined,
  salesChannelId: string,
): PromotionRuleInput[] => [
  ...(rules ?? []).filter((rule) => rule.attribute !== TENANT_CHANNEL_RULE_ATTRIBUTE),
  {
    attribute: TENANT_CHANNEL_RULE_ATTRIBUTE,
    operator: "eq",
    values: [salesChannelId],
  },
];

/**
 * The ids of the promotion's own `sales_channel_id` rules. `POST
 * /tenants/promotions` leaves exactly one behind; the list is plural because a
 * promotion created before this route existed, or one the native Admin touched,
 * may carry none or several, and `rules/batch` has to refuse a write against
 * any of them rather than against one known id.
 */
export const listChannelRuleIds = async (
  req: AuthenticatedMedusaRequest,
  promotionId: string,
): Promise<string[]> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: promotions } = await query.graph({
    entity: "promotion",
    fields: ["id", "rules.id", "rules.attribute"],
    filters: { id: [promotionId] },
  });

  return ((promotions[0]?.rules ?? []) as { id?: string; attribute?: string }[])
    .filter((rule) => rule?.attribute === TENANT_CHANNEL_RULE_ATTRIBUTE)
    .map((rule) => rule?.id)
    .filter((id): id is string => Boolean(id));
};

const channelRuleIsLocked = (what: string) =>
  new MedusaError(
    MedusaError.Types.INVALID_DATA,
    `The "${TENANT_CHANNEL_RULE_ATTRIBUTE}" rule of a tenant promotion cannot be ${what}. ` +
      "It is what keeps the promotion inside the tenant's own sales channel.",
  );

/**
 * The guard on `POST /tenants/promotions/:id/rules/batch`: the forced
 * `sales_channel_id` rule may not be deleted, may not be updated, and no second
 * one may be created. Without all three the batch is a way out of the channel:
 * deleting the rule makes the promotion global, updating its values moves it to
 * another tenant's channel, and adding a second rule widens it to both.
 *
 * Target rules and buy rules are not guarded: they select which LINE ITEMS the
 * discount applies to inside a cart that already passed the promotion's own
 * rules, so they cannot reach another tenant's channel.
 */
export const assertChannelRuleNotTouched = async (
  req: AuthenticatedMedusaRequest,
  promotionId: string,
  body: {
    create?: PromotionRuleInput[];
    update?: ({ id: string } & Partial<PromotionRuleInput>)[];
    delete?: string[];
  },
): Promise<void> => {
  if ((body.create ?? []).some((rule) => rule.attribute === TENANT_CHANNEL_RULE_ATTRIBUTE)) {
    throw channelRuleIsLocked("created a second time");
  }

  const updateIds = (body.update ?? []).map((rule) => rule.id);
  const deleteIds = body.delete ?? [];

  if (updateIds.length === 0 && deleteIds.length === 0) {
    return;
  }

  const channelRuleIds = new Set(await listChannelRuleIds(req, promotionId));

  if (deleteIds.some((id) => channelRuleIds.has(id))) {
    throw channelRuleIsLocked("deleted");
  }

  if (updateIds.some((id) => channelRuleIds.has(id))) {
    throw channelRuleIsLocked("updated");
  }
};

export type PromotionRuleBatchBody = {
  create?: PromotionRuleInput[];
  update?: ({ id: string } & Partial<PromotionRuleInput>)[];
  delete?: string[];
};

/**
 * The validated batch body as `batchPromotionRulesWorkflow` wants it. One cast,
 * in one place, for the same reason the create route casts its promotion data:
 * the validator types `operator` as a zod native enum and the workflow as the
 * promotion module's string union.
 */
export const toRuleBatchInput = (
  id: string,
  ruleType: RuleType,
  body: PromotionRuleBatchBody,
) => ({
  id,
  rule_type: ruleType,
  create: body.create as unknown as CreatePromotionRuleDTO[] | undefined,
  update: body.update as unknown as UpdatePromotionRuleDTO[] | undefined,
  delete: body.delete,
});
