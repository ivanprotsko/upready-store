import type { PresetAttributeKey } from "./default-schema";

/**
 * Turning what a migrated catalog carries in `metadata` into values of the
 * default schema (b04-product-attributes).
 *
 * The shop of the real owner arrived from two marketplaces, so the same fact
 * is spelled six ways: «Страна производства» and «Страна-изготовитель», «Вес
 * (с упаковкой)» in kilograms next to «Вес товара, г» in grams, a shelf life
 * given as «60 месяцев», «5 лет» and a bare «1825» under the name «Срок
 * годности в днях». A backfill that copied the strings across would put all
 * six into the product page and none into a filter.
 *
 * So the parser does three things and each is testable on its own:
 * `readCharacteristics` reads the bag whatever shape it has,
 * `matchAttributeName` maps a name onto one characteristic of the schema, and
 * `parseQuantity` / `parseShelfLife` turn a human string into the typed value
 * that characteristic stores.
 *
 * NOTHING here invents a value. A name it does not know comes back in
 * `unrecognised` and lands in the report, so the owner sees what the catalog
 * holds and the schema does not (rule 20a: zero is not empty).
 */

export type RawCharacteristic = { name: string; value: string };

/** Unit a characteristic's NAME implies, when the value carries none. */
export type NameUnit = "g" | "ml" | "days" | null;

export type NameMatch = {
  key: PresetAttributeKey;
  /** Lower is better: «Вес (без упаковки)» beats «Вес (с упаковкой)». */
  rank: number;
  unit: NameUnit;
};

const NAME_MAP: Record<string, NameMatch> = {};

const declare = (names: string[], key: PresetAttributeKey, unit: NameUnit = null) => {
  names.forEach((name, index) => {
    NAME_MAP[name] = { key, rank: index, unit };
  });
};

// The order inside each list is the preference order, measured against the
// migrated catalog: a weight without packaging describes the product, a weight
// with it describes the parcel.
declare(["артикул", "артикул производителя", "код товара", "код"], "sku");
declare(["состав", "состав продукта", "состав товара"], "composition");
declare(["объем", "объем продукта", "объем товара"], "volume", "ml");
declare(
  [
    "вес (без упаковки)",
    "вес",
    "вес нетто",
    "вес товара",
    "масса",
    "вес (с упаковкой)",
    "вес брутто",
  ],
  "weight",
  "g",
);
declare(
  ["страна производства", "страна-изготовитель", "страна изготовитель", "страна происхождения", "страна"],
  "country",
);
declare(["срок годности", "срок хранения", "гарантийный срок"], "shelf_life");
declare(["срок годности в днях", "срок хранения в днях"], "shelf_life", "days");
declare(
  [
    "назначение",
    "назначение добавки",
    "область применения",
    "область использования",
    "показания к применению",
    "применение",
    "действие",
  ],
  "purpose",
);

/**
 * The comparable form of a characteristic's name: lowercase, `ё` folded onto
 * `е`, whitespace collapsed, a trailing unit suffix («, мл», «, г») dropped
 * into the match itself rather than into the name.
 *
 * The suffix is dropped because the marketplace writes the unit into the name
 * and the value then comes bare: «Объем, мл» = «60» is 60 millilitres, and
 * without this the value would read as 60 of nothing.
 */
export const normaliseName = (name: string): string =>
  String(name ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .replace(/[.:;]+$/, "")
    .trim();

const UNIT_SUFFIX: { pattern: RegExp; unit: NameUnit }[] = [
  { pattern: /,\s*мл$/, unit: "ml" },
  { pattern: /,\s*л$/, unit: "ml" },
  { pattern: /,\s*г$/, unit: "g" },
  { pattern: /,\s*гр$/, unit: "g" },
  { pattern: /,\s*кг$/, unit: "g" },
  { pattern: /,\s*шт$/, unit: null },
];

/**
 * The characteristic of the default schema this name belongs to, or `null`
 * when the schema has no place for it.
 *
 * A name is matched whole, never by a prefix: «Объем чаши» is a property of a
 * multicooker's bowl and not the volume of the product, and a prefix match
 * would have filed it as one.
 */
export const matchAttributeName = (name: string): NameMatch | null => {
  const normalised = normaliseName(name);
  const direct = NAME_MAP[normalised];
  if (direct) {
    return direct;
  }

  for (const { pattern, unit } of UNIT_SUFFIX) {
    if (!pattern.test(normalised)) {
      continue;
    }
    const bare = normalised.replace(pattern, "").trim();
    const match = NAME_MAP[bare];
    if (match) {
      return { ...match, unit: unit ?? match.unit };
    }
  }

  return null;
};

const collapse = (value: string): string => value.replace(/\s+/g, " ").trim();

/** One entry of the bag, whatever shape the marketplace exported it in. */
const readEntry = (entry: unknown): RawCharacteristic | null => {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const name = typeof record.name === "string" ? collapse(record.name) : "";
  if (!name) {
    return null;
  }

  // `value` (Ozon) and `values` (Wildberries) are the two shapes measured in
  // the migrated catalog; a multi-value list joins with «; », the separator
  // the migration itself already used inside a single string.
  let value = "";
  if (typeof record.value === "string" || typeof record.value === "number") {
    value = String(record.value);
  } else if (Array.isArray(record.values)) {
    value = record.values
      .filter((item) => typeof item === "string" || typeof item === "number")
      .map((item) => collapse(String(item)))
      .filter(Boolean)
      .join("; ");
  }

  value = collapse(value);

  return value ? { name, value } : null;
};

/** `Ключ: значение` on its own line, or several separated by `;` or `|`. */
const readLines = (text: string): RawCharacteristic[] => {
  const out: RawCharacteristic[] = [];

  for (const line of text.split(/[\n\r]+|\s*\|\s*/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    // The FIRST colon splits, so «Состав: масло какао; календула» keeps its
    // own semicolons and «Назначение: при варикозе: отёках» keeps its second
    // colon inside the value.
    const separator = trimmed.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const name = collapse(trimmed.slice(0, separator));
    const value = collapse(trimmed.slice(separator + 1));
    if (name && value) {
      out.push({ name, value });
    }
  }

  return out;
};

/**
 * Name/value pairs out of `metadata.full_characteristics` in any of the shapes
 * a migrated catalog holds: a JSON array of objects, that array already
 * parsed, a plain object, or `«Ключ: значение»` lines.
 *
 * Anything it cannot read gives an EMPTY list rather than a throw: the backfill
 * runs over a whole catalog and one malformed product must not stop it. The
 * product then shows up in the report with no values, which is the honest
 * outcome.
 */
export const readCharacteristics = (raw: unknown): RawCharacteristic[] => {
  if (raw === null || raw === undefined) {
    return [];
  }

  if (Array.isArray(raw)) {
    return raw.map(readEntry).filter((entry): entry is RawCharacteristic => Boolean(entry));
  }

  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) {
      return [];
    }
    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        return readCharacteristics(JSON.parse(text));
      } catch {
        // Broken JSON is broken JSON, never «Ключ: значение» lines: reading
        // `[{"name":"Состав"` by its colons yields the pair
        // `[{"name" = "Состав"`, a characteristic nobody wrote. The product
        // comes back empty and shows up in the report instead.
        return [];
      }
    }
    return readLines(text);
  }

  if (typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .map(([name, value]) => readEntry({ name, value }))
      .filter((entry): entry is RawCharacteristic => Boolean(entry));
  }

  return [];
};

const UNIT_FACTOR: Record<string, { target: "g" | "ml"; factor: number }> = {
  мг: { target: "g", factor: 0.001 },
  г: { target: "g", factor: 1 },
  гр: { target: "g", factor: 1 },
  грамм: { target: "g", factor: 1 },
  кг: { target: "g", factor: 1000 },
  g: { target: "g", factor: 1 },
  kg: { target: "g", factor: 1000 },
  мл: { target: "ml", factor: 1 },
  л: { target: "ml", factor: 1000 },
  литр: { target: "ml", factor: 1000 },
  ml: { target: "ml", factor: 1 },
  l: { target: "ml", factor: 1000 },
};

/**
 * `«0.3 кг»` as 300 grams, `«2 л»` as 2000 millilitres, `«60»` under «Объем,
 * мл» as 60 millilitres.
 *
 * A unit of the OTHER quantity is refused rather than converted: «0.3 кг»
 * under a volume is not 300 ml, and a filter «объём до 500» would then be
 * answered with a weight. `null` means «this is not a number of `target`»,
 * and the value stays in the report instead of reaching the catalog.
 *
 * The result is rounded to three decimals: the column is Postgres `real`
 * (about seven significant digits), and 0.027 kg must come back as 27 g
 * rather than 27.000000953674316.
 */
export const parseQuantity = (
  raw: string | number,
  target: "g" | "ml",
  unitFromName: NameUnit = null,
): number | null => {
  const text = collapse(String(raw ?? "")).replace(",", ".");
  if (!text) {
    return null;
  }

  const match = /^([0-9]+(?:\.[0-9]+)?)\s*([a-zа-я]*)\.?$/i.exec(text);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return null;
  }

  const unitText = match[2].toLowerCase();

  if (!unitText) {
    // No unit in the value: the name has to supply one, and it has to be the
    // quantity asked for.
    return unitFromName === target ? amount : null;
  }

  const unit = UNIT_FACTOR[unitText];
  if (!unit || unit.target !== target) {
    return null;
  }

  return Math.round(amount * unit.factor * 1000) / 1000;
};

const RU_DAYS = (count: number): string => {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) {
    return "дней";
  }
  if (mod10 === 1) {
    return "день";
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return "дня";
  }
  return "дней";
};

/**
 * The shelf life as the product page should read it.
 *
 * The catalog gives it in three units («60 месяцев», «5 лет», «1825» under
 * «Срок годности в днях»), and this characteristic is TEXT for that reason:
 * converting all three to months would report 1825 days as «60 месяцев» on one
 * product and 750 as «25 месяцев» on the next, a number the owner never wrote
 * and cannot check against the package. A bare number under a name that says
 * «в днях» gets the word it is missing, and everything else is kept verbatim.
 */
export const parseShelfLife = (raw: string | number, unitFromName: NameUnit = null): string | null => {
  const text = collapse(String(raw ?? ""));
  if (!text) {
    return null;
  }

  if (unitFromName === "days" && /^[0-9]+$/.test(text)) {
    const count = Number(text);
    return `${count} ${RU_DAYS(count)}`;
  }

  return text;
};

export type ParsedValues = Partial<Record<PresetAttributeKey, string | number>>;

export type ParseResult = {
  /** Value per characteristic of the default schema. */
  values: ParsedValues;
  /** Which name in the bag each value came from, for the report. */
  sources: Partial<Record<PresetAttributeKey, string>>;
  /** Names the schema has no place for, in the order they appeared. */
  unrecognised: RawCharacteristic[];
  /** Names that matched but whose value could not be typed (a weight under a volume). */
  rejected: (RawCharacteristic & { key: PresetAttributeKey; reason: string })[];
};

const TEXT_LIMIT = 2_000;

/**
 * One product's characteristics bag turned into values of the default schema.
 *
 * When two names map onto the same characteristic the better-ranked one wins
 * («Вес (без упаковки)» over «Вес (с упаковкой)»), not the last one read: the
 * result must not depend on the order a marketplace happened to export in.
 */
export const parseCharacteristics = (raw: unknown): ParseResult => {
  const result: ParseResult = { values: {}, sources: {}, unrecognised: [], rejected: [] };
  const rankByKey = new Map<PresetAttributeKey, number>();

  for (const entry of readCharacteristics(raw)) {
    const match = matchAttributeName(entry.name);

    if (!match) {
      result.unrecognised.push(entry);
      continue;
    }

    let value: string | number | null;
    switch (match.key) {
      case "volume":
        value = parseQuantity(entry.value, "ml", match.unit);
        break;
      case "weight":
        value = parseQuantity(entry.value, "g", match.unit);
        break;
      case "shelf_life":
        value = parseShelfLife(entry.value, match.unit);
        break;
      default:
        value = entry.value.slice(0, TEXT_LIMIT);
    }

    if (value === null || value === "") {
      result.rejected.push({
        ...entry,
        key: match.key,
        reason: match.key === "volume" || match.key === "weight" ? "не число этой величины" : "пустое значение",
      });
      continue;
    }

    const currentRank = rankByKey.get(match.key);
    if (currentRank !== undefined && currentRank <= match.rank) {
      continue;
    }

    rankByKey.set(match.key, match.rank);
    result.values[match.key] = value;
    result.sources[match.key] = entry.name;
  }

  return result;
};

/**
 * The volume or weight a variant carries in its own TITLE, which is where a
 * shop that never filled a marketplace card writes it: «Зубная паста тайская с
 * гвоздикой, 30 гр», «Мазь от варикоза, 100 мл», «Мёд маточный 125 гр».
 *
 * Only an explicit unit counts, and only as the last quantity in the title, so
 * «Таблетки от варикоза, 60 шт» gives nothing (pieces are neither) and «АСД 2
 * фракция» gives nothing (the 2 names the fraction). The value the customer
 * already reads on the button is the same value the characteristic gets;
 * nothing is inferred from a description.
 */
export const quantityFromTitle = (
  title: string | null | undefined,
): { key: "weight" | "volume"; value: number } | null => {
  const text = collapse(String(title ?? ""));
  if (!text) {
    return null;
  }

  const pattern = /([0-9]+(?:[.,][0-9]+)?)\s*(мг|гр|г|кг|мл|л)(?![а-яёa-z])/gi;
  let last: RegExpExecArray | null = null;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    last = match;
  }

  if (!last) {
    return null;
  }

  const unit = UNIT_FACTOR[last[2].toLowerCase()];
  if (!unit) {
    return null;
  }

  const key = unit.target === "g" ? "weight" : "volume";
  const value = parseQuantity(`${last[1]} ${last[2]}`, unit.target);

  return value === null ? null : { key, value };
};

export type ProductInput = {
  metadata: Record<string, unknown> | null | undefined;
  /** SKU of the product's first variant, the article number when the bag has none. */
  sku?: string | null;
  /** Title of the product's first variant, the last place a volume is written. */
  variantTitle?: string | null;
};

/**
 * Everything one product can contribute to the default schema: the
 * characteristics bag first, then the plain `metadata` keys the migration
 * wrote on their own (`composition`, `application`), then the variant SKU as
 * the article number.
 *
 * The order is the trust order and each source only fills what the previous
 * one left empty. The bag is the owner's own marketplace card; `composition`
 * is the same fact the migration lifted out of a description; the SKU is ours.
 */
export const collectProductValues = (product: ProductInput): ParseResult => {
  const metadata = product.metadata ?? {};
  const result = parseCharacteristics(metadata.full_characteristics);

  // The second bag is the short card of the same marketplace. It repeats the
  // full one on every product measured, so it only ever fills a gap.
  const short = parseCharacteristics(metadata.short_characteristics);
  for (const [key, value] of Object.entries(short.values) as [PresetAttributeKey, string | number][]) {
    if (result.values[key] === undefined) {
      result.values[key] = value;
      result.sources[key] = short.sources[key];
    }
  }

  const plain: [PresetAttributeKey, string][] = [
    ["composition", "composition"],
    ["purpose", "application"],
  ];

  for (const [key, metadataKey] of plain) {
    if (result.values[key] !== undefined) {
      continue;
    }
    const value = metadata[metadataKey];
    if (typeof value !== "string") {
      continue;
    }
    const text = collapse(value);
    if (text) {
      result.values[key] = text.slice(0, TEXT_LIMIT);
      result.sources[key] = `metadata.${metadataKey}`;
    }
  }

  // The variant title is the LAST source and fills a gap only: a card that
  // says «Вес (без упаковки) 350 г» beats a button that says «400 г».
  const fromTitle = quantityFromTitle(product.variantTitle);
  if (fromTitle && result.values[fromTitle.key] === undefined) {
    result.values[fromTitle.key] = fromTitle.value;
    result.sources[fromTitle.key] = "variant.title";
  }

  if (result.values.sku === undefined && product.sku) {
    const sku = collapse(product.sku);
    if (sku) {
      result.values.sku = sku;
      result.sources.sku = "variant.sku";
    }
  }

  return result;
};

/**
 * The machine value of a country choice: `«Россия»` is stored as `russia`, so
 * a filter URL and a CSV column stay stable while the label is translated.
 *
 * Transliteration is a CODEC, not a guess, and the map below covers what the
 * migrated catalog holds; anything else transliterates by the same rules the
 * product handles use, so a new country gets a machine value rather than being
 * dropped.
 */
const COUNTRY_VALUES: Record<string, { value: string; en: string }> = {
  россия: { value: "russia", en: "Russia" },
  рф: { value: "russia", en: "Russia" },
  китай: { value: "china", en: "China" },
  индия: { value: "india", en: "India" },
  таиланд: { value: "thailand", en: "Thailand" },
  беларусь: { value: "belarus", en: "Belarus" },
  казахстан: { value: "kazakhstan", en: "Kazakhstan" },
};

export const countryChoice = (
  label: string,
  slugify: (text: string) => string,
): { value: string; label: string; en?: string } | null => {
  const text = collapse(label);
  if (!text) {
    return null;
  }

  const known = COUNTRY_VALUES[normaliseName(text)];
  if (known) {
    return { value: known.value, label: text, en: known.en };
  }

  const value = slugify(text).replace(/-/g, "_");
  return value ? { value, label: text } : null;
};
