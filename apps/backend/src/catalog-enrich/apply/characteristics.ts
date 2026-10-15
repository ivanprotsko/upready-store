import type { MedusaContainer } from "@medusajs/framework";
import { coerceValue, type AttributeOptionRow } from "../../api/tenants/product-attributes/helpers";
import { TENANT_MODULE } from "../../modules/tenant";
import type { AttributeType } from "../../modules/tenant/models/tenant-product-attribute";
import type TenantModuleService from "../../modules/tenant/service";
import { ensureChoice } from "../../product-attributes-fill/apply-default-schema";
import {
  countryChoice,
  parseCharacteristics,
} from "../../product-attributes-fill/parse-characteristics";
import { toSlug } from "../../product-csv/slugify";
import { attributeKeyFromName } from "../attributes";
import type { DatasetProduct } from "../dataset";
import type { ApplyOptions, SectionCounters, LiveProduct } from "./live";

/**
 * The characteristics section and the shop's attribute schema it fills.
 *
 * `../apply.ts` runs the sections in order and re-exports what callers use
 * from here (t-2026-10-14-55).
 */

type AttributeRecord = { id: string; key: string; type: AttributeType; name: string };

/** The shop's characteristic schema, indexed by key, refreshed as rows are added. */
export type SchemaCache = {
  byKey: Map<string, AttributeRecord>;
  optionsByAttribute: Map<string, AttributeOptionRow[]>;
  nextPosition: number;
};

export const loadSchema = async (
  container: MedusaContainer,
  tenantId: string,
): Promise<SchemaCache> => {
  const service = container.resolve<TenantModuleService>(TENANT_MODULE);
  const rows = (await service.listTenantProductAttributes({
    tenant_id: tenantId,
  })) as unknown as (AttributeRecord & { position: number })[];

  const options = (await service.listTenantProductAttributeOptions({
    attribute_id: rows.map((row) => row.id),
  })) as unknown as (AttributeOptionRow & { attribute_id: string })[];

  const optionsByAttribute = new Map<string, AttributeOptionRow[]>();
  for (const option of options) {
    const list = optionsByAttribute.get(option.attribute_id) ?? [];
    list.push(option);
    optionsByAttribute.set(option.attribute_id, list);
  }

  return {
    byKey: new Map(rows.map((row) => [row.key, row])),
    optionsByAttribute,
    nextPosition: rows.reduce((max, row) => Math.max(max, (row.position ?? 0) + 1), 0),
  };
};

/**
 * The characteristic a WB name belongs to, creating the shop's own row for a
 * name the preset has no place for.
 *
 * The preset keys (`country`, `composition`, `volume`, …) are matched first by
 * `parseCharacteristics`, so «Страна производства» fills the shop's existing
 * «Страна производства» rather than a second one beside it. Everything the
 * preset does not know — «Форма выпуска», «Упаковка», «Объем чаши» — becomes a
 * characteristic of this shop with WB's own Russian name, a transliterated key
 * and the `text` type, shown on the product page and left out of the filter
 * bar: a free-text value would put one chip per product in the catalogue.
 */
const ensureOwnAttribute = async (
  container: MedusaContainer,
  tenantId: string,
  schema: SchemaCache,
  name: string,
  options: ApplyOptions,
  counters: SectionCounters,
): Promise<AttributeRecord | null> => {
  const key = attributeKeyFromName(name);

  if (!key) {
    counters.characteristics_dropped += 1;
    options.logger.warn(`[enrich] характеристика «${name}»: из названия не выходит ключ, пропущена`);
    return null;
  }

  const known = schema.byKey.get(key);
  if (known) {
    return known;
  }

  counters.attributes_created += 1;
  options.logger.info(`[enrich] новая характеристика магазина: «${name}» (${key})`);

  if (options.dryRun) {
    const pending: AttributeRecord = { id: "(ещё не создана)", key, type: "text", name };
    schema.byKey.set(key, pending);
    return pending;
  }

  const service = container.resolve<TenantModuleService>(TENANT_MODULE);
  const created = await service.createTenantProductAttributes({
    tenant_id: tenantId,
    key,
    name,
    type: "text" as AttributeType,
    unit: null,
    position: schema.nextPosition,
    category_id: null,
    show_on_product: true,
    use_as_filter: false,
  });

  const row = (Array.isArray(created) ? created[0] : created) as AttributeRecord;
  schema.nextPosition += 1;
  schema.byKey.set(key, row);
  return row;
};

const sameTypedValue = (
  stored: { value_text: string | null; value_number: number | null; value_boolean: boolean | null },
  typed: { value_text: string | null; value_number: number | null; value_boolean: boolean | null },
): boolean =>
  (stored.value_text ?? null) === typed.value_text &&
  (stored.value_number ?? null) === typed.value_number &&
  (stored.value_boolean ?? null) === typed.value_boolean;

export const applyCharacteristics = async (
  container: MedusaContainer,
  tenantId: string,
  schema: SchemaCache,
  product: LiveProduct,
  entry: DatasetProduct,
  options: ApplyOptions,
  counters: SectionCounters,
): Promise<void> => {
  if (!entry.characteristics.length) {
    return;
  }

  const service = container.resolve<TenantModuleService>(TENANT_MODULE);

  // The preset's own reader, so a WB «Страна производства» lands in the shop's
  // `country` and not in a second characteristic of the same meaning.
  const parsed = parseCharacteristics(
    entry.characteristics.map((one) => ({ name: one.name, value: one.value })),
  );

  const wanted: { key: string; raw: string | number }[] = [];

  for (const [key, value] of Object.entries(parsed.values)) {
    if (value !== undefined && value !== null && value !== "") {
      wanted.push({ key, raw: value });
    }
  }

  for (const one of parsed.unrecognised) {
    const attribute = await ensureOwnAttribute(container, tenantId, schema, one.name, options, counters);
    if (attribute) {
      wanted.push({ key: attribute.key, raw: one.value });
    }
  }

  const existing = (await service.listTenantProductAttributeValues({
    product_id: product.id,
  })) as unknown as {
    id: string;
    attribute_id: string;
    value_text: string | null;
    value_number: number | null;
    value_boolean: boolean | null;
  }[];
  const byAttribute = new Map(existing.map((row) => [row.attribute_id, row]));

  for (const item of wanted) {
    const attribute = schema.byKey.get(item.key);
    if (!attribute) {
      counters.characteristics_dropped += 1;
      continue;
    }

    let choices = schema.optionsByAttribute.get(attribute.id) ?? [];
    let raw: string | number | boolean = item.raw;

    if (attribute.type === "select") {
      // A `select` refuses a value it has not declared, so a country the
      // preset never listed is declared from the label the card carries.
      if (options.dryRun) {
        // The dry run is the safety check before a live run, so it has to
        // reach the same comparison with the stored value the live run does.
        // It resolves the choice the way `ensureChoice` does and declares
        // nothing: a choice the shop lacks stands in the list for this one
        // product only. Counting every `select` as written here meant a second
        // dry run over an already filled shop never came down to zero.
        const wantedChoice = countryChoice(String(item.raw), toSlug);
        if (!wantedChoice) {
          counters.characteristics_dropped += 1;
          continue;
        }
        if (!choices.some((choice) => choice.value === wantedChoice.value)) {
          choices = [
            ...choices,
            { id: "", value: wantedChoice.value, label: wantedChoice.label, position: choices.length },
          ];
        }
        raw = wantedChoice.value;
      } else {
        const choice = await ensureChoice(container, attribute.id, String(item.raw));
        if (!choice) {
          counters.characteristics_dropped += 1;
          continue;
        }
        if (choice.created) {
          choices = (await container
            .resolve<TenantModuleService>(TENANT_MODULE)
            .listTenantProductAttributeOptions({
              attribute_id: attribute.id,
            })) as unknown as AttributeOptionRow[];
          schema.optionsByAttribute.set(attribute.id, choices);
        }
        raw = choice.value;
      }
    }

    let typed: { value_text: string | null; value_number: number | null; value_boolean: boolean | null } | null;
    try {
      typed = coerceValue(attribute, choices, raw);
    } catch (error) {
      counters.characteristics_dropped += 1;
      options.logger.warn(
        `[enrich] ${product.handle}: «${attribute.name}» = «${String(raw)}» не принято: ` +
          (error instanceof Error ? error.message : String(error)),
      );
      continue;
    }

    if (!typed) {
      counters.characteristics_dropped += 1;
      continue;
    }

    const stored = byAttribute.get(attribute.id);

    if (stored && sameTypedValue(stored, typed)) {
      counters.characteristics_unchanged += 1;
      continue;
    }

    counters.characteristics_written += 1;

    if (options.dryRun) {
      continue;
    }

    if (stored) {
      await service.updateTenantProductAttributeValues({ id: stored.id, ...typed });
    } else {
      await service.createTenantProductAttributeValues({
        tenant_id: tenantId,
        product_id: product.id,
        attribute_id: attribute.id,
        ...typed,
      });
    }
  }
};
