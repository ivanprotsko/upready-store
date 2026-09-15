/**
 * Cell → value, with the failure modes a price list from a spreadsheet actually
 * has. Every function here returns either a value or a message the owner can
 * act on; nothing guesses, because a guessed price is a wrong price on a live
 * shop.
 */

/** Every space a spreadsheet may put inside a number, including the non-breaking ones. */
const SPACES = /[\s   ']/g;

export type ValueResult<T> = { ok: true; value: T } | { ok: false; message: string };

const ok = <T>(value: T): ValueResult<T> => ({ ok: true, value });
const fail = (message: string): ValueResult<never> => ({ ok: false, message });

export const isBlank = (cell: string | undefined): boolean => (cell ?? "").trim() === "";

/**
 * A money amount in major units (`19.99`), the unit Medusa 2 stores a price in.
 *
 * Accepts a dot or a comma as the decimal separator, because a Russian Excel
 * writes `1234,56`, and accepts the spaces such an Excel puts between
 * thousands. It REFUSES the one shape that cannot be read without guessing:
 * a single comma with exactly three digits behind it and digits in front
 * (`1,234`), which is 1.234 to a Russian spreadsheet and 1234 to an American
 * one. A thousandfold price error is not worth a default.
 */
export const parseAmount = (cell: string): ValueResult<number> => {
  const raw = cell.trim();

  if (raw === "") {
    return fail("пусто");
  }

  const compact = raw.replace(SPACES, "");
  const hasDot = compact.includes(".");
  const hasComma = compact.includes(",");

  if (!/^[0-9.,]+$/.test(compact)) {
    return fail(`«${raw}» — не число`);
  }

  let normalized = compact;

  if (hasDot && hasComma) {
    // The LAST separator is the decimal one; the other groups thousands.
    const decimalSeparator = compact.lastIndexOf(",") > compact.lastIndexOf(".") ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = compact.split(thousandsSeparator).join("").replace(decimalSeparator, ".");
  } else if (hasComma) {
    if (compact.split(",").length > 2) {
      return fail(`«${raw}» — не число`);
    }
    if (/^\d+,\d{3}$/.test(compact)) {
      return fail(
        `«${raw}» — неоднозначно: это 1,234 (дробное) или 1 234 (тысячи)? ` +
          "Напишите цену с точкой (1.234) или без разделителя тысяч (1234).",
      );
    }
    normalized = compact.replace(",", ".");
  } else if (compact.split(".").length > 2) {
    return fail(`«${raw}» — не число`);
  }

  const value = Number(normalized);

  if (!Number.isFinite(value)) {
    return fail(`«${raw}» — не число`);
  }

  if (value < 0) {
    return fail(`«${raw}» — цена не может быть отрицательной`);
  }

  return ok(value);
};

/** A non-negative whole number: a stock count, a weight in grams, a dimension. */
export const parseInteger = (cell: string): ValueResult<number> => {
  const raw = cell.trim();

  if (raw === "") {
    return fail("пусто");
  }

  const compact = raw.replace(SPACES, "").replace(",", ".");

  if (!/^\d+(\.0+)?$/.test(compact)) {
    return fail(`«${raw}» — не целое число`);
  }

  return ok(Math.trunc(Number(compact)));
};

export const PRODUCT_STATUSES = ["draft", "published", "proposed", "rejected"] as const;

export type ProductStatusValue = (typeof PRODUCT_STATUSES)[number];

/** Medusa's four product statuses, plus the two Russian words the panel shows. */
export const parseStatus = (cell: string): ValueResult<ProductStatusValue> => {
  const raw = cell.trim().toLowerCase();

  const aliases: Record<string, ProductStatusValue> = {
    черновик: "draft",
    опубликован: "published",
    опубликовано: "published",
    публикация: "published",
  };

  const resolved = (PRODUCT_STATUSES as readonly string[]).includes(raw)
    ? (raw as ProductStatusValue)
    : aliases[raw];

  if (!resolved) {
    return fail(`«${cell.trim()}» — неизвестный статус (draft, published, proposed, rejected)`);
  }

  return ok(resolved);
};

/**
 * The `category` cell: a path from the root down, levels separated by `/`
 * («Добавки / АСД»). Empty levels are dropped, so `Добавки //АСД` and
 * `Добавки / АСД` are the same path and a trailing slash is not a level.
 */
export const parseCategoryPath = (cell: string): string[] =>
  cell
    .split("/")
    .map((level) => level.trim())
    .filter((level) => level !== "");

/** The `images` cell: URLs separated by `|` or by line breaks, in order. */
export const parseImageList = (cell: string): string[] =>
  cell
    .split(/[|\r\n]+/)
    .map((url) => url.trim())
    .filter((url) => url !== "");

/**
 * Hosts an import must never fetch from. The importer downloads a URL the file
 * names, which makes it a request the SHOP OWNER can aim at anything the
 * backend can reach: a metadata service, a database admin on localhost, a
 * neighbour on the same private network. Only public http(s) is allowed.
 *
 * The check is on the HOSTNAME as written plus, at fetch time, on the address
 * it resolved to (`images.ts`), because a public name can point at 127.0.0.1.
 */
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?fe80:/i,
  /\.internal$/i,
  /\.local$/i,
];

export const isPrivateHostname = (hostname: string): boolean => {
  const host = hostname.replace(/^\[|\]$/g, "");
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host));
};

/** Shape and destination check for an image URL, before anything is fetched. */
export const checkImageUrl = (raw: string): ValueResult<string> => {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return fail(`«${raw}» — не похоже на адрес картинки`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return fail(`«${raw}» — поддерживаются только http и https`);
  }

  if (isPrivateHostname(url.hostname)) {
    return fail(`«${raw}» — адрес во внутренней сети, такие мы не загружаем`);
  }

  return ok(url.toString());
};

/** `19.99` from a Medusa price, which may arrive as a string or a BigNumber-ish object. */
export const amountToNumber = (amount: unknown): number | null => {
  if (typeof amount === "number") {
    return Number.isFinite(amount) ? amount : null;
  }

  if (typeof amount === "string") {
    const value = Number(amount);
    return Number.isFinite(value) ? value : null;
  }

  if (amount && typeof amount === "object" && "numeric_" in (amount as Record<string, unknown>)) {
    return amountToNumber((amount as { numeric_: unknown }).numeric_);
  }

  return null;
};

/**
 * How a money amount is written into the file: plain digits with a dot, no
 * grouping, trailing zeros trimmed. Grouping is what makes a re-imported file
 * ambiguous (see `parseAmount`), so the export never writes it.
 */
export const formatAmount = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
};
