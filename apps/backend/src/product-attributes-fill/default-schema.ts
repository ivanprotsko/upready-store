import type { AttributeType } from "../modules/tenant/models/tenant-product-attribute";

/**
 * The characteristics a shop starts with (b04-product-attributes).
 *
 * t15 gave a shop owner an empty schema and a screen to fill it in. An empty
 * screen is where the migrated shop of a real owner stopped: 39 products on
 * the live host and `tenant_product_attribute` = 0
 * (`handoff/day-2026-09-16-oksana-store/artifacts/q03-gap-recheck/gap-recheck.md`,
 * «Осталось критичного» §7). So the shop gets a starting set rather than a
 * blank page, and the owner adds their own on top: these rows are ordinary
 * characteristics once created, editable and deletable like any other.
 *
 * The six names come from the task text (артикул, состав, объём/вес, страна
 * производства, срок годности, назначение); «объём/вес» is TWO rows here,
 * because a volume in millilitres and a weight in grams cannot share one
 * number column and one unit.
 *
 * Which of them filter, and why only two: a filter is worth a chip in the
 * catalogue only when a visitor picks from a short list of values. Country is
 * such a list (four values across the migrated catalog, measured on the stand),
 * and volume is a range. Composition, purpose and shelf life are free text of
 * a dozen words and would put a hundred one-product chips on the screen; the
 * article number is looked up, not browsed. They are shown on the product page
 * and left out of the filter bar.
 */
export type PresetAttributeKey =
  | "sku"
  | "composition"
  | "volume"
  | "weight"
  | "country"
  | "shelf_life"
  | "purpose";

export type PresetAttribute = {
  key: PresetAttributeKey;
  name: string;
  type: AttributeType;
  unit: string | null;
  position: number;
  show_on_product: boolean;
  use_as_filter: boolean;
  /** Translations of `name`, by locale. The base text above is Russian. */
  translations: Record<string, string>;
  /** Declared choices of a `select`, machine value first. */
  options?: { value: string; label: string; translations: Record<string, string> }[];
};

export const DEFAULT_ATTRIBUTE_PRESET: PresetAttribute[] = [
  {
    key: "sku",
    name: "Артикул",
    type: "text",
    unit: null,
    position: 0,
    show_on_product: true,
    use_as_filter: false,
    translations: { en: "Article number" },
  },
  {
    key: "composition",
    name: "Состав",
    type: "text",
    unit: null,
    position: 1,
    show_on_product: true,
    use_as_filter: false,
    translations: { en: "Composition" },
  },
  {
    key: "volume",
    name: "Объём",
    type: "number",
    unit: "мл",
    position: 2,
    show_on_product: true,
    use_as_filter: true,
    translations: { en: "Volume" },
  },
  {
    key: "weight",
    name: "Вес",
    type: "number",
    unit: "г",
    position: 3,
    show_on_product: true,
    use_as_filter: false,
    translations: { en: "Weight" },
  },
  {
    key: "country",
    name: "Страна производства",
    type: "select",
    unit: null,
    position: 4,
    show_on_product: true,
    use_as_filter: true,
    translations: { en: "Country of manufacture" },
    options: [{ value: "russia", label: "Россия", translations: { en: "Russia" } }],
  },
  {
    key: "shelf_life",
    name: "Срок годности",
    type: "text",
    unit: null,
    position: 5,
    show_on_product: true,
    use_as_filter: false,
    translations: { en: "Shelf life" },
  },
  {
    key: "purpose",
    name: "Назначение",
    type: "text",
    unit: null,
    position: 6,
    show_on_product: true,
    use_as_filter: false,
    translations: { en: "Purpose" },
  },
];

export const PRESET_BY_KEY = new Map<PresetAttributeKey, PresetAttribute>(
  DEFAULT_ATTRIBUTE_PRESET.map((attribute) => [attribute.key, attribute]),
);
