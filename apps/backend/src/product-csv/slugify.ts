/**
 * A product code (Medusa handle) out of a Russian product name
 * (t14-product-import).
 *
 * Needed because `Код товара` is the one column a shop owner adding a line to
 * their price list will leave empty, and a handle is not optional: it is the
 * storefront URL and it is UNIQUE ACROSS THE WHOLE PLATFORM, not per shop
 * (`IDX_product_handle_unique` on `product`, `WHERE deleted_at IS NULL`). So it
 * has to be produced here, checked for collisions before anything is written
 * (`uniqueness.ts`), and shown in the dry-run report — rather than left to
 * Medusa's own `toHandle`, which strips Cyrillic down to nothing and would give
 * every Russian product the same empty handle.
 */

/** GOST-ish transliteration, the spelling a Russian shop expects in a URL. */
const CYRILLIC: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  і: "i",
  ї: "yi",
  є: "e",
  ґ: "g",
};

export const transliterate = (text: string): string =>
  [...text.toLowerCase()].map((char) => CYRILLIC[char] ?? char).join("");

/**
 * `АСД-2 фракция, 100 мл` becomes `asd-2-frakciya-100-ml`. Empty input, or
 * input that transliterates to nothing, gives an empty string: the caller
 * decides what to do about that rather than getting a silent placeholder
 * (rule 20a).
 */
export const toSlug = (text: string): string =>
  transliterate(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

/**
 * The first of `base`, `base-2`, `base-3`… that `taken` does not hold. Used for
 * a handle this importer generated itself; a handle the owner TYPED is never
 * silently renamed, it is reported as taken.
 */
export const firstFreeSlug = (base: string, taken: Set<string>): string => {
  if (!taken.has(base)) {
    return base;
  }

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  return `${base}-${Date.now()}`;
};
