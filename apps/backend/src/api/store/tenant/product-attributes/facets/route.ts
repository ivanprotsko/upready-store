import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { listAttributeDtos } from "../../../../tenants/product-attributes/attribute-dto";
import {
  ATTRIBUTE_REFERENCE,
  OPTION_REFERENCE,
  listCategorySubtree,
  pickTranslated,
  readTranslations,
} from "../../../../tenants/product-attributes/helpers";
import { resolveTenantFromPublishableKey } from "../../resolve-tenant";
import {
  countBooleanValues,
  countTextValues,
  numberRange,
  scopedProductIds,
  type AttributeSelection,
} from "../facet-queries";
import { parseSelections } from "../selection";

/**
 * `GET /store/tenant/product-attributes/facets` — the catalogue filter bar
 * and the product ids the current selection leaves (t15-product-attributes).
 *
 * Parameters: `?category_id=` narrows to a category and its subtree, and one
 * `a_<key>=` per selected characteristic (`selection.ts` carries the format).
 * Nothing else: this route reads the shop's own schema and its own values, and
 * the tenant comes from the publishable key the framework already validated,
 * never from the query.
 *
 * What the answer is FOR. `facets` draws the bar: a `select` or `text`
 * characteristic as a list of values with counts, a `number` as a range with
 * the span that exists. A value that matches nothing under the current
 * selection comes back with `count: 0` and `disabled: true` rather than
 * missing, so the buyer sees what the shop carries instead of watching options
 * vanish. `product_ids` is the narrowed set the listing then shows — `null`
 * when no characteristic is selected, which is «do not narrow» and is a
 * different thing from `[]`, «nothing matches».
 *
 * Every count is computed here, over the data, in one aggregate per facet.
 * None is guessed from the page of products the storefront happens to hold.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);

  const filterable = await listAttributeDtos(req.scope, tenant.id, { use_as_filter: true });

  if (!filterable.length) {
    res.json({ facets: [], product_ids: null, count: 0 });
    return;
  }

  const rawCategoryId =
    typeof req.query.category_id === "string" ? req.query.category_id : null;
  const categoryIds = rawCategoryId
    ? [...(await listCategorySubtree(req.scope, [rawCategoryId]))]
    : null;

  const typeByKey = new Map(filterable.map((attribute) => [attribute.key, attribute.type]));
  const idByKey = new Map(filterable.map((attribute) => [attribute.key, attribute.id]));
  const parsed = parseSelections(req.query as Record<string, unknown>, typeByKey);

  // Which characteristics belong on THIS page is decided by the data, not by
  // the schema: a facet is drawn only when some product in scope carries a
  // value for it (the `values.length` and `span.min` checks below). Deciding
  // it from `category_id` instead would need three rules at once — the
  // characteristic declared on the category, on an ancestor of it, on a
  // descendant — and would still be wrong on `/store`, where every category is
  // in view. The write path already refuses a value under a characteristic the
  // product's category does not declare, so «has a value here» IS «applies
  // here».
  const inScope = filterable;
  const inScopeKeys = new Set(inScope.map((attribute) => attribute.key));

  const selections: AttributeSelection[] = parsed
    .filter((selection) => inScopeKeys.has(selection.key))
    .map((selection) => {
      const attributeId = idByKey.get(selection.key) as string;
      return selection.type === "range"
        ? { type: "range" as const, attributeId, min: selection.min, max: selection.max }
        : selection.type === "booleans"
          ? { type: "booleans" as const, attributeId, values: selection.values }
          : { type: "values" as const, attributeId, values: selection.values };
    });

  const scopeArgs = { tenantId: tenant.id, categoryIds, selections };

  const [nameTranslations, labelTranslations] = await Promise.all([
    readTranslations(
      req.scope,
      ATTRIBUTE_REFERENCE,
      inScope.map((attribute) => attribute.id),
    ),
    readTranslations(
      req.scope,
      OPTION_REFERENCE,
      inScope.flatMap((attribute) => attribute.options.map((option) => option.id)),
    ),
  ]);

  const facets = await Promise.all(
    inScope.map(async (attribute) => {
      const name = pickTranslated(
        attribute.name,
        nameTranslations.get(attribute.id),
        "name",
        req.locale,
      );
      const base = {
        key: attribute.key,
        name,
        type: attribute.type,
        unit: attribute.unit,
        position: attribute.position,
      };

      // Counts: every OTHER facet's selection applied, this one's left out.
      const countArgs = { ...scopeArgs, exclude: attribute.id, attributeId: attribute.id };
      // The value list: no attribute selection at all, so a value that matches
      // nothing right now is still offered, disabled.
      const universeArgs = {
        tenantId: tenant.id,
        categoryIds,
        selections: [],
        attributeId: attribute.id,
      };

      if (attribute.type === "number") {
        const [span, selected] = await Promise.all([
          numberRange(req.scope, universeArgs),
          numberRange(req.scope, countArgs),
        ]);

        if (span.min === null || span.max === null) {
          return null;
        }

        return {
          ...base,
          values: [],
          range: { min: span.min, max: span.max, count: selected.count },
        };
      }

      if (attribute.type === "boolean") {
        const [universe, counts] = await Promise.all([
          countBooleanValues(req.scope, universeArgs),
          countBooleanValues(req.scope, countArgs),
        ]);
        const countByValue = new Map(counts.map((row) => [String(row.value), row.count]));

        const values = universe
          .map((row) => {
            const count = countByValue.get(String(row.value)) ?? 0;
            return {
              value: String(row.value),
              label: String(row.value),
              count,
              disabled: count === 0,
            };
          })
          .sort((a, b) => a.value.localeCompare(b.value));

        return values.length ? { ...base, values, range: null } : null;
      }

      const [universe, counts] = await Promise.all([
        countTextValues(req.scope, universeArgs),
        countTextValues(req.scope, countArgs),
      ]);
      const countByValue = new Map(counts.map((row) => [row.value, row.count]));
      const labelByValue = new Map(
        attribute.options.map((option) => [
          option.value,
          pickTranslated(
            option.label,
            labelTranslations.get(option.id),
            "label",
            req.locale,
          ),
        ]),
      );
      const positionByValue = new Map(
        attribute.options.map((option) => [option.value, option.position]),
      );

      const values = universe
        .map((row) => {
          const count = countByValue.get(row.value) ?? 0;
          return {
            value: row.value,
            label: labelByValue.get(row.value) ?? row.value,
            count,
            disabled: count === 0,
          };
        })
        .sort((a, b) => {
          const positionA = positionByValue.get(a.value) ?? Number.MAX_SAFE_INTEGER;
          const positionB = positionByValue.get(b.value) ?? Number.MAX_SAFE_INTEGER;
          if (positionA !== positionB) {
            return positionA - positionB;
          }
          return a.label.localeCompare(b.label);
        });

      // A filter with no values is not shown at all: the characteristic is
      // declared but nothing in this category carries it.
      return values.length ? { ...base, values, range: null } : null;
    }),
  );

  const product_ids = selections.length ? await scopedProductIds(req.scope, scopeArgs) : null;

  res.json({
    facets: facets.filter(Boolean),
    product_ids,
    count: product_ids ? product_ids.length : 0,
  });
};
