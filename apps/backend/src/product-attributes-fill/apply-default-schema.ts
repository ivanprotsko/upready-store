import type { MedusaContainer } from "@medusajs/framework";
import {
  ATTRIBUTE_REFERENCE,
  OPTION_REFERENCE,
  writeTranslations,
} from "../api/tenants/product-attributes/helpers";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import { toSlug } from "../product-csv/slugify";
import { DEFAULT_ATTRIBUTE_PRESET, type PresetAttribute } from "./default-schema";
import { countryChoice } from "./parse-characteristics";

/**
 * Putting the default schema (`default-schema.ts`) into one shop, and adding a
 * choice to a `select` when the catalog turns out to hold one the preset did
 * not declare (b04-product-attributes).
 *
 * Both are idempotent and additive: a characteristic whose `key` already
 * exists is LEFT AS IT IS, name, unit, flags and all. The owner renaming
 * «Объём» or turning its filter off must survive the next run of the backfill,
 * and a second run of either function must change nothing — which is why every
 * decision here is taken on `key`, the one column the panel cannot edit.
 *
 * Shared by the backfill script and by `POST /tenants/product-attributes/defaults`,
 * so the button in the panel and the script create exactly the same rows.
 */

export type EnsureSchemaResult = {
  /** Keys created by this call. */
  created: string[];
  /** Keys that already stood in the shop's schema. */
  existing: string[];
};

type AttributeRecord = { id: string; key: string; type: string };

const attributeService = (container: MedusaContainer): TenantModuleService =>
  container.resolve(TENANT_MODULE);

const createPresetAttribute = async (
  container: MedusaContainer,
  tenantId: string,
  preset: PresetAttribute,
): Promise<string> => {
  const service = attributeService(container);

  const created = await service.createTenantProductAttributes({
    tenant_id: tenantId,
    key: preset.key,
    name: preset.name,
    type: preset.type,
    unit: preset.unit,
    position: preset.position,
    category_id: null,
    show_on_product: preset.show_on_product,
    use_as_filter: preset.use_as_filter,
  });

  const row = Array.isArray(created) ? created[0] : created;

  await writeTranslations(container, ATTRIBUTE_REFERENCE, row.id, "name", preset.translations);

  for (const [index, option] of (preset.options ?? []).entries()) {
    const createdOption = await service.createTenantProductAttributeOptions({
      attribute_id: row.id,
      value: option.value,
      label: option.label,
      position: index,
    });
    const optionRow = Array.isArray(createdOption) ? createdOption[0] : createdOption;
    await writeTranslations(
      container,
      OPTION_REFERENCE,
      optionRow.id,
      "label",
      option.translations,
    );
  }

  return row.id;
};

/**
 * The shop's schema after the preset has been applied: every characteristic of
 * `DEFAULT_ATTRIBUTE_PRESET` exists, and nothing that already stood there was
 * touched.
 */
export const ensureDefaultSchema = async (
  container: MedusaContainer,
  tenantId: string,
): Promise<EnsureSchemaResult> => {
  const service = attributeService(container);
  const existing = (await service.listTenantProductAttributes({
    tenant_id: tenantId,
  })) as unknown as AttributeRecord[];

  const byKey = new Map(existing.map((attribute) => [attribute.key, attribute]));
  const result: EnsureSchemaResult = { created: [], existing: [] };

  for (const preset of DEFAULT_ATTRIBUTE_PRESET) {
    if (byKey.has(preset.key)) {
      result.existing.push(preset.key);
      continue;
    }
    await createPresetAttribute(container, tenantId, preset);
    result.created.push(preset.key);
  }

  return result;
};

export type ChoiceResult = {
  /** The machine value the product row stores. */
  value: string;
  /** Whether this call declared the choice. */
  created: boolean;
};

/**
 * The machine value for a `select` characteristic's human label, declaring the
 * choice when the shop has none for it.
 *
 * A backfill that only wrote values the preset already knew would drop every
 * Thai and Indian product's country on the floor and report nothing: the write
 * itself rejects an undeclared choice (`coerceValue`). So the choice is
 * created, from the label the catalog carries, with the machine value the
 * transliteration codec produces — `Таиланд` is `thailand`, not a guess.
 */
export const ensureChoice = async (
  container: MedusaContainer,
  attributeId: string,
  label: string,
): Promise<ChoiceResult | null> => {
  const choice = countryChoice(label, toSlug);
  if (!choice) {
    return null;
  }

  const service = attributeService(container);
  const options = (await service.listTenantProductAttributeOptions({
    attribute_id: attributeId,
  })) as unknown as { id: string; value: string; position: number }[];

  const known = options.find((option) => option.value === choice.value);
  if (known) {
    return { value: known.value, created: false };
  }

  const position = options.reduce((max, option) => Math.max(max, option.position + 1), 0);
  const created = await service.createTenantProductAttributeOptions({
    attribute_id: attributeId,
    value: choice.value,
    label: choice.label,
    position,
  });
  const row = Array.isArray(created) ? created[0] : created;

  if (choice.en) {
    await writeTranslations(container, OPTION_REFERENCE, row.id, "label", { en: choice.en });
  }

  return { value: choice.value, created: true };
};
