import type { MedusaContainer } from "@medusajs/framework";
import { TENANT_MODULE } from "../../../modules/tenant";
import type TenantModuleService from "../../../modules/tenant/service";
import {
  ATTRIBUTE_REFERENCE,
  OPTION_REFERENCE,
  byPosition,
  readTranslations,
  type AttributeOptionRow,
  type AttributeRow,
} from "./helpers";

/**
 * Reading the owner's schema back out: the rows, their choices, and the
 * translations that hang off both. One place, because the list route, the
 * detail route, the product screen and the storefront all want the same
 * object and differ only in what they are allowed to see.
 */

export type AttributeOptionDto = AttributeOptionRow & {
  translations: Record<string, string>;
};

export type AttributeDto = AttributeRow & {
  options: AttributeOptionDto[];
  translations: Record<string, string>;
};

const translationsOf = (
  byLocale: Map<string, Record<string, unknown>> | undefined,
  field: string,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [locale, fields] of byLocale ?? []) {
    const value = fields?.[field];
    if (typeof value === "string" && value.trim() !== "") {
      out[locale] = value;
    }
  }
  return out;
};

/**
 * Every characteristic of one tenant, choices and translations included,
 * sorted the way the owner ordered them.
 *
 * `filters` narrows further (`use_as_filter: true` for the storefront's facet
 * bar, an `id` for the detail screen). The tenant id is never one of them — it
 * is always passed separately, so no caller can widen this to a neighbour.
 */
export const listAttributeDtos = async (
  container: MedusaContainer,
  tenantId: string,
  filters: Record<string, unknown> = {},
): Promise<AttributeDto[]> => {
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

  const rows = (await tenantModuleService.listTenantProductAttributes({
    ...filters,
    tenant_id: tenantId,
  })) as unknown as AttributeRow[];

  if (!rows.length) {
    return [];
  }

  const attributeIds = rows.map((row) => row.id);
  const optionRows = (await tenantModuleService.listTenantProductAttributeOptions({
    attribute_id: attributeIds,
  })) as unknown as (AttributeOptionRow & { attribute_id: string })[];

  const [attributeTranslations, optionTranslations] = await Promise.all([
    readTranslations(container, ATTRIBUTE_REFERENCE, attributeIds),
    readTranslations(
      container,
      OPTION_REFERENCE,
      optionRows.map((row) => row.id),
    ),
  ]);

  const optionsByAttribute = new Map<string, AttributeOptionDto[]>();
  for (const option of optionRows) {
    const list = optionsByAttribute.get(option.attribute_id) ?? [];
    list.push({
      id: option.id,
      value: option.value,
      label: option.label,
      position: option.position,
      translations: translationsOf(optionTranslations.get(option.id), "label"),
    });
    optionsByAttribute.set(option.attribute_id, list);
  }

  return rows
    .map((row) => ({
      id: row.id,
      key: row.key,
      name: row.name,
      type: row.type,
      unit: row.unit ?? null,
      position: row.position,
      category_id: row.category_id ?? null,
      show_on_product: row.show_on_product,
      use_as_filter: row.use_as_filter,
      options: (optionsByAttribute.get(row.id) ?? []).sort(byPosition),
      translations: translationsOf(attributeTranslations.get(row.id), "name"),
    }))
    .sort(byPosition);
};
