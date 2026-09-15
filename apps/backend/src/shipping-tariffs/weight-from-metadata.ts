/**
 * Reads a product's shipping weight out of the metadata a catalog import left
 * behind. No Medusa imports: the script `src/scripts/import-product-weights.ts`
 * and the unit tests call the same functions.
 *
 * The shapes below are the ones actually standing in this customer's catalog
 * (measured 2026-09-15 on the `cherkashino` tenant, 38 products):
 *
 *   metadata.full_characteristics: [{name: "Вес (с упаковкой)", values: ["70 г"]}]
 *   metadata.short_characteristics: [{name: "Вес товара, г", value: "30"}]
 *
 * plus the plain keys an owner or a CSV import may write (`weight`,
 * `weight_g`, `вес`). A bare number under a name that names its own unit
 * («Вес товара, г») is read in that unit; a number with no unit anywhere is
 * NOT guessed at, it is skipped, because 30 kilograms and 30 grams are both
 * plausible and the wrong one silently overcharges every buyer.
 */

export type WeightSource =
  | "characteristics"
  | "metadata-key"
  | "title"
  /** Nothing in the metadata says what the item weighs. */
  | "none";

export type WeightReading = {
  /** Grams, rounded to a whole gram. Null when nothing readable was found. */
  weight_g: number | null;
  source: WeightSource;
  /** The text the number came from, for the script's report. */
  evidence: string | null;
};

const NOTHING: WeightReading = { weight_g: null, source: "none", evidence: null };

const UNIT_TO_GRAMS: Record<string, number> = {
  г: 1,
  гр: 1,
  грамм: 1,
  граммов: 1,
  грамма: 1,
  g: 1,
  gr: 1,
  кг: 1000,
  килограмм: 1000,
  kg: 1000,
};

const normalise = (text: string): string => text.toLowerCase().replace(/ /g, " ").trim();

/** `"1,2 кг"` → 1200; `"70 г"` → 70; `"30"` → null (no unit of its own). */
export const parseWeightValue = (raw: unknown): { grams: number; had_unit: boolean } | null => {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? { grams: raw, had_unit: false } : null;
  }
  if (typeof raw !== "string") {
    return null;
  }
  const text = normalise(raw);
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*([a-zа-яё]*)/);
  if (!match) {
    return null;
  }
  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const unit = match[2];
  if (!unit) {
    return { grams: amount, had_unit: false };
  }
  const factor = UNIT_TO_GRAMS[unit];
  if (!factor) {
    return null;
  }
  return { grams: amount * factor, had_unit: true };
};

/**
 * The unit a characteristic's NAME declares («Вес товара, г»), or null.
 *
 * The unit ends at a letter, not at `\b`: JavaScript word boundaries are
 * ASCII, so `г\b` never matches a Cyrillic «г» at the end of a string. The
 * alternatives are longest-first for the same reason — «грамм» must not be
 * read as «г» followed by «рамм».
 */
export const unitFromName = (name: string): number | null => {
  const text = normalise(name);
  const match = text.match(/[,(]\s*(килограмм|граммов|грамма|грамм|кг|гр|г|kg|gr|g)(?![a-zа-яё])/);
  return match ? (UNIT_TO_GRAMS[match[1]] ?? null) : null;
};

/**
 * Is this characteristic a weight? «Вес», «Вес товара, г», «Масса нетто»,
 * «Weight». Again no `\b`: it is ASCII, so `\bвес\b` matches nothing at all.
 */
const isWeightName = (name: string): boolean =>
  /(?:^|[^a-zа-яё])(вес|масса|weight)(?![а-яёa-z])/.test(normalise(name));

/** A shipping weight is the packed one; «без упаковки» is the net weight and loses to it. */
const packagingRank = (name: string): number => {
  const text = normalise(name);
  if (text.includes("без упаковки")) return 0;
  if (text.includes("с упаковкой") || text.includes("брутто")) return 2;
  return 1;
};

type Characteristic = { name?: unknown; value?: unknown; values?: unknown };

const characteristicValue = (entry: Characteristic): unknown => {
  if (entry.value !== undefined && entry.value !== null) {
    return entry.value;
  }
  if (Array.isArray(entry.values) && entry.values.length) {
    return entry.values[0];
  }
  return null;
};

const readCharacteristics = (list: unknown): WeightReading => {
  if (!Array.isArray(list)) {
    return NOTHING;
  }
  let best: (WeightReading & { rank: number }) | null = null;
  for (const raw of list) {
    if (typeof raw !== "object" || raw === null) {
      continue;
    }
    const entry = raw as Characteristic;
    const name = typeof entry.name === "string" ? entry.name : "";
    if (!name || !isWeightName(name)) {
      continue;
    }
    const value = characteristicValue(entry);
    const parsed = parseWeightValue(value);
    if (!parsed) {
      continue;
    }
    const nameUnit = unitFromName(name);
    // A bare number takes the unit its name declares; with neither we skip it.
    const grams = parsed.had_unit ? parsed.grams : nameUnit ? parsed.grams * nameUnit : null;
    if (grams === null || grams <= 0) {
      continue;
    }
    const rank = packagingRank(name);
    if (!best || rank > best.rank) {
      best = {
        weight_g: Math.round(grams),
        source: "characteristics",
        evidence: `${name}: ${String(value)}`,
        rank,
      };
    }
  }
  if (!best) {
    return NOTHING;
  }
  const { rank: _rank, ...reading } = best;
  return reading;
};

const PLAIN_KEYS = ["weight_g", "weight", "вес", "ves", "shipping_weight"];

const readPlainKey = (metadata: Record<string, unknown>): WeightReading => {
  for (const key of PLAIN_KEYS) {
    const raw = metadata[key];
    if (raw === undefined || raw === null) {
      continue;
    }
    const parsed = parseWeightValue(raw);
    if (!parsed) {
      continue;
    }
    // A bare number here IS grams: that is the unit every weight in this
    // repository is written in (`tariff.ts`), and `weight_g` says so in its name.
    return { weight_g: Math.round(parsed.grams), source: "metadata-key", evidence: `${key}: ${String(raw)}` };
  }
  return NOTHING;
};

/**
 * «Сеннол 125 гр» → 125 g. Only a number with an explicit weight unit counts,
 * so «120 капсул» and «10 шт» are not mistaken for a weight. Off by default in
 * the script: a title says what is INSIDE the package, not what the parcel
 * weighs, so the owner opts in to it knowing that.
 */
export const weightFromTitle = (title: string | null | undefined): WeightReading => {
  if (!title) {
    return NOTHING;
  }
  const text = normalise(title);
  const match = text.match(
    /(\d+(?:[.,]\d+)?)\s*(килограмм|граммов|грамма|грамм|кг|гр|г|kg|g)(?![a-zа-яё])/,
  );
  if (!match) {
    return NOTHING;
  }
  const amount = Number(match[1].replace(",", "."));
  const factor = UNIT_TO_GRAMS[match[2]];
  if (!Number.isFinite(amount) || amount <= 0 || !factor) {
    return NOTHING;
  }
  return { weight_g: Math.round(amount * factor), source: "title", evidence: match[0] };
};

/**
 * The shipping weight of one product, in grams. Characteristics first (the
 * catalog import's own field), then a plain metadata key, then — only when
 * `fromTitle` is on — the title.
 */
export const weightFromMetadata = (
  metadata: unknown,
  options: { title?: string | null; fromTitle?: boolean } = {},
): WeightReading => {
  if (typeof metadata === "object" && metadata !== null) {
    const record = metadata as Record<string, unknown>;
    const full = readCharacteristics(record.full_characteristics);
    const fromCharacteristics = full.weight_g !== null ? full : readCharacteristics(record.short_characteristics);
    if (fromCharacteristics.weight_g !== null) {
      return fromCharacteristics;
    }
    const plain = readPlainKey(record);
    if (plain.weight_g !== null) {
      return plain;
    }
  }
  if (options.fromTitle) {
    return weightFromTitle(options.title);
  }
  return NOTHING;
};
