import { isValidAttributeKey } from "../modules/tenant/models/tenant-product-attribute";
import { transliterate } from "../product-csv/slugify";

/**
 * The machine key of a characteristic the shop's schema has no name for
 * (w07-tenant-catalog-enrich).
 *
 * `tenant_product_attribute.key` is what a filter URL (`a_<key>`) and a CSV
 * column (`attr:<key>`) address, so it is latin, lowercase, underscore-joined
 * and stable: the same WB characteristic name must give the same key on the
 * stand and on the live host, or an `--import` would create a second
 * characteristic beside the one the stand already filled.
 *
 * The transliteration is the repository's own codec, the one the product slugs
 * already use, so «Страна производства» becomes `strana_proizvodstva` rather
 * than a guess. A name that transliterates to nothing (an emoji, a Chinese
 * name) gives `null`, and the characteristic then lands in the report instead
 * of the catalog (rule 20a: a value invented for an absence is worse than an
 * absence found).
 */
export const attributeKeyFromName = (name: string): string | null => {
  const key = transliterate(String(name ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 40)
    .replace(/_+$/, "");

  return isValidAttributeKey(key) ? key : null;
};
