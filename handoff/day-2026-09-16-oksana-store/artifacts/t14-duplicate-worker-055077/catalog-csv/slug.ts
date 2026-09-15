/**
 * A handle for a row that has none. Cyrillic is transliterated rather than
 * dropped, because a handle is what stands in the storefront URL and
 * `/products/---` is not a product address.
 *
 * The table is the same one `specs/tenant-address/CANONICAL.md` fixes for the
 * shop handle, kept here because the product handle is the same kind of
 * identifier and there is no shared module for it yet.
 */

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh",
  щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .split("")
    .map((char) => CYRILLIC[char] ?? char)
    .join("")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

/** `slugify`, then `-2`, `-3`… until the name is free of everything in `taken`. */
export const uniqueSlug = (text: string, taken: Set<string>): string => {
  const base = slugify(text) || "product";

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
