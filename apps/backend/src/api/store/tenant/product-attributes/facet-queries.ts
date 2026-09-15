import type { MedusaContainer } from "@medusajs/framework";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * The facet arithmetic of the catalogue filters (t15-product-attributes).
 *
 * One aggregate per facet, NEVER one query per value: a shop with 3 000
 * products and a «Состав» of forty choices would otherwise pay forty round
 * trips to draw one filter. Everything here is `GROUP BY` over
 * `tenant_product_attribute_value`, which is indexed on
 * `(tenant_id, attribute_id, value_text)` and on
 * `(tenant_id, attribute_id, value_number)` for exactly these two shapes.
 *
 * Two scopes, and the difference between them is what makes a facet usable:
 *
 * - the COUNT of a value in facet F is taken with every OTHER facet's
 *   selection applied but not F's own, so a buyer who picked «травы» still
 *   sees how many «витамины» there are and can switch to them;
 * - the LIST of values in facet F is taken with no attribute selection at all,
 *   so a value that currently matches nothing comes back with a count of zero
 *   and is DISABLED rather than disappearing. A filter that hides what it
 *   cannot offer leaves the buyer guessing what the shop has.
 *
 * A number comparison is cast `::real` on purpose: the column is `real`
 * (`model.float()`), and `value_number <= 0.1` with a float8 literal is false
 * for a row holding exactly 0.1 (measured on Postgres 17:
 * `select 0.1::real <= 0.1` → f, `select 0.1::real <= 0.1::real` → t).
 */

export type AttributeSelection =
  | { type: "values"; attributeId: string; values: string[] }
  | { type: "booleans"; attributeId: string; values: boolean[] }
  | { type: "range"; attributeId: string; min: number | null; max: number | null };

type ScopeArgs = {
  tenantId: string;
  categoryIds: string[] | null;
  selections: AttributeSelection[];
  /** Attribute id whose own selection is left out (the facet being counted). */
  exclude?: string;
};

const pgOf = (container: MedusaContainer) =>
  container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

/**
 * The products in scope: owned by this tenant, published, in the category (or
 * its subtree) when one was asked for, and matching every attribute selection
 * except the excluded one.
 *
 * `status = 'published'` matters for the count to be honest: a draft product
 * is not on the listing the count sits next to, so counting it would print a
 * number the buyer can never reach.
 */
const scopeSql = (
  knex: Knex,
  { tenantId, categoryIds, selections, exclude }: ScopeArgs,
): Knex.QueryBuilder => {
  const query = knex
    .select("link.product_id")
    .from({ link: "tenant_tenant_product_product" })
    .join({ pr: "product" }, "pr.id", "link.product_id")
    .where("link.tenant_id", tenantId)
    .whereNull("link.deleted_at")
    .whereNull("pr.deleted_at")
    .where("pr.status", "published");

  if (categoryIds) {
    // An empty category scope is an empty result, not «no filter»: a category
    // with no products must show no products.
    query.whereIn(
      "link.product_id",
      knex
        .select("pcp.product_id")
        .from({ pcp: "product_category_product" })
        .whereIn("pcp.product_category_id", categoryIds),
    );
  }

  for (const selection of selections) {
    if (selection.attributeId === exclude) {
      continue;
    }

    query.whereExists((builder) => {
      const inner = builder
        .select(knex.raw("1"))
        .from({ v: "tenant_product_attribute_value" })
        .whereRaw("v.product_id = link.product_id")
        .where("v.attribute_id", selection.attributeId)
        .whereNull("v.deleted_at");

      if (selection.type === "values") {
        inner.whereIn("v.value_text", selection.values);
      } else if (selection.type === "booleans") {
        inner.whereIn("v.value_boolean", selection.values);
      } else {
        if (selection.min !== null) {
          inner.whereRaw("v.value_number >= ?::real", [selection.min]);
        }
        if (selection.max !== null) {
          inner.whereRaw("v.value_number <= ?::real", [selection.max]);
        }
        if (selection.min === null && selection.max === null) {
          inner.whereNotNull("v.value_number");
        }
      }

      return inner;
    });
  }

  return query;
};

/** Product ids matching the whole selection, in no particular order. */
export const scopedProductIds = async (
  container: MedusaContainer,
  args: Omit<ScopeArgs, "exclude">,
): Promise<string[]> => {
  const knex = pgOf(container);
  const rows = (await scopeSql(knex, args)) as { product_id: string }[];
  return rows.map((row) => row.product_id);
};

export type TextCount = { value: string; count: number };
export type BooleanCount = { value: boolean; count: number };
export type NumberRange = { min: number | null; max: number | null; count: number };

/** `{ value_text: count }` for one characteristic over the given scope. */
export const countTextValues = async (
  container: MedusaContainer,
  args: ScopeArgs & { attributeId: string },
): Promise<TextCount[]> => {
  const knex = pgOf(container);
  const rows = (await knex
    .select({ value: "v.value_text" })
    .count({ count: knex.raw("distinct v.product_id") })
    .from({ v: "tenant_product_attribute_value" })
    .whereIn("v.product_id", scopeSql(knex, args))
    .where("v.attribute_id", args.attributeId)
    .whereNotNull("v.value_text")
    .whereNull("v.deleted_at")
    .groupBy("v.value_text")) as { value: string; count: string }[];

  return rows.map((row) => ({ value: row.value, count: Number(row.count) }));
};

/** `{ true: n, false: m }` for a yes/no characteristic over the given scope. */
export const countBooleanValues = async (
  container: MedusaContainer,
  args: ScopeArgs & { attributeId: string },
): Promise<BooleanCount[]> => {
  const knex = pgOf(container);
  const rows = (await knex
    .select({ value: "v.value_boolean" })
    .count({ count: knex.raw("distinct v.product_id") })
    .from({ v: "tenant_product_attribute_value" })
    .whereIn("v.product_id", scopeSql(knex, args))
    .where("v.attribute_id", args.attributeId)
    .whereNotNull("v.value_boolean")
    .whereNull("v.deleted_at")
    .groupBy("v.value_boolean")) as { value: boolean; count: string }[];

  return rows.map((row) => ({ value: row.value, count: Number(row.count) }));
};

/**
 * The span a range control opens on, plus how many products carry a value at
 * all. `min`/`max` are `null` when nothing in scope has one: the route then
 * leaves the facet out, because a range with no ends is a control that cannot
 * be used.
 */
export const numberRange = async (
  container: MedusaContainer,
  args: ScopeArgs & { attributeId: string },
): Promise<NumberRange> => {
  const knex = pgOf(container);
  const [row] = (await knex
    .select({
      min: knex.raw("min(v.value_number)"),
      max: knex.raw("max(v.value_number)"),
    })
    .count({ count: knex.raw("distinct v.product_id") })
    .from({ v: "tenant_product_attribute_value" })
    .whereIn("v.product_id", scopeSql(knex, args))
    .where("v.attribute_id", args.attributeId)
    .whereNotNull("v.value_number")
    .whereNull("v.deleted_at")) as {
    min: number | null;
    max: number | null;
    count: string;
  }[];

  return {
    min: row?.min ?? null,
    max: row?.max ?? null,
    count: Number(row?.count ?? 0),
  };
};
