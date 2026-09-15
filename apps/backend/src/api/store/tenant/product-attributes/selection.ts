import type { AttributeType } from "../../../../modules/tenant/models/tenant-product-attribute";

/**
 * How a catalogue filter is spelled in the URL (t15-product-attributes).
 *
 * One query parameter per characteristic, named `a_<key>` after its machine
 * key. The key is what survives a rename of the display name, so a filter
 * someone bookmarked or a shop linked to keeps working after the owner edits
 * the label:
 *
 *   /store?a_sostav=Магний&a_sostav=Трава   a choice or a text, one param each
 *   /store?a_obem=100..500                   a number: an inclusive range
 *   /store?a_obem=..500                      one end left open
 *   /store?a_organic=true                    a yes/no
 *
 * A value is NEVER split on a comma: «Трава, витамин C» is one composition, and
 * a shop that writes its characteristics in prose would otherwise see one value
 * become two the moment it reached a filter. Several values are several
 * parameters, which is the spelling `optionValueIds` already uses on this
 * storefront.
 *
 * The characteristic's declared `type` decides how its raw string is read, so
 * `100..500` is a range for a number and a literal value for a text. The
 * storefront writes the same spelling
 * (`apps/storefront/src/lib/util/product-attribute-filters.ts`), and that file
 * and this one are the two ends of one format.
 */

export const ATTRIBUTE_PARAM_PREFIX = "a_";

export const RANGE_SEPARATOR = "..";

export type ParsedSelection =
  | { key: string; type: "values"; values: string[] }
  | { key: string; type: "booleans"; values: boolean[] }
  | { key: string; type: "range"; min: number | null; max: number | null };

/** Express parses a repeated parameter into an array; one entry is one value. */
const asValues = (raw: unknown): string[] => {
  if (typeof raw === "string") {
    return [raw];
  }
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string");
  }
  return [];
};

const parseNumber = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * The selections in one request, keyed by characteristic key. Unknown keys and
 * unreadable values are dropped rather than erroring: a filter URL is
 * something a visitor edits and a search engine mangles, and a stale `a_`
 * parameter must show the catalogue, not a 400.
 */
export const parseSelections = (
  query: Record<string, unknown>,
  typeByKey: Map<string, AttributeType>,
): ParsedSelection[] => {
  const selections: ParsedSelection[] = [];

  for (const [param, rawValue] of Object.entries(query)) {
    if (!param.startsWith(ATTRIBUTE_PARAM_PREFIX)) {
      continue;
    }

    const key = param.slice(ATTRIBUTE_PARAM_PREFIX.length);
    const type = typeByKey.get(key);
    const rawValues = asValues(rawValue).filter((value) => value.trim() !== "");
    const raw = rawValues[0];

    if (!type || raw === undefined) {
      continue;
    }

    if (type === "number") {
      const [from, to] = raw.includes(RANGE_SEPARATOR)
        ? raw.split(RANGE_SEPARATOR)
        : [raw, raw];
      const min = parseNumber(from ?? "");
      const max = parseNumber(to ?? "");
      if (min === null && max === null) {
        continue;
      }
      selections.push({ key, type: "range", min, max });
      continue;
    }

    if (type === "boolean") {
      const values = rawValues
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item === "true" || item === "false")
        .map((item) => item === "true");
      if (!values.length) {
        continue;
      }
      selections.push({ key, type: "booleans", values: Array.from(new Set(values)) });
      continue;
    }

    const values = Array.from(
      new Set(rawValues.map((item) => item.trim()).filter(Boolean)),
    );
    if (!values.length) {
      continue;
    }
    selections.push({ key, type: "values", values });
  }

  return selections;
};
