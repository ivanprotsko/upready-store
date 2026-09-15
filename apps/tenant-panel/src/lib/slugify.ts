/**
 * A product code (Medusa handle) out of a Russian name (f11-new-product-404).
 *
 * The owner types «Мёд трутневой» and Medusa 2.19 turns that into the handle
 * `мёд-трутневой`: its own `toHandle` keeps every `\p{L}`, Cyrillic included
 * (`@medusajs/utils/dist/common/to-handle.js`). The product then sits in the
 * catalogue with a Cyrillic URL, and a Cyrillic URL is a poor address to put
 * in an advert, a messenger or a price feed. So the panel produces the handle
 * itself, in the spelling a Russian shop expects, and shows it in the form
 * before anything is saved.
 *
 * TWIN: `apps/backend/src/product-csv/slugify.ts`, the catalogue importer's
 * copy. The two apps ship in separate Docker images and share no package, so
 * the table and the rules are duplicated on purpose and held together by
 * `apps/backend/src/product-csv/__tests__/slugify-twin.unit.spec.ts`, which
 * fails when either side is edited alone. Edit both.
 */

/* --- shared with the twin, keep identical --- */

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
}

export const transliterate = (text: string): string =>
  [...text.toLowerCase()].map((char) => CYRILLIC[char] ?? char).join("")

/**
 * `АСД-2 фракция, 100 мл` becomes `asd-2-fraktsiya-100-ml`. Empty input, or
 * input that transliterates to nothing, gives an empty string: the caller
 * decides what to do about that rather than getting a silent placeholder
 * (rule 20a).
 */
export const toSlug = (text: string): string =>
  transliterate(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "")

/* --- end of the shared block --- */

/**
 * What the handle field shows while the owner is typing INTO it. `toSlug`
 * alone would eat the hyphen they just typed in the middle of a word, so a
 * single trailing hyphen survives here and the value settles on blur.
 */
export const toSlugWhileTyping = (text: string): string => {
  const slug = toSlug(text)
  return /[^a-z0-9]$/i.test(text) && slug ? `${slug}-` : slug
}
