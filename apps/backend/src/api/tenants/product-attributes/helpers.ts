import type { MedusaContainer } from "@medusajs/framework";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils";
import type { AttributeType } from "../../../modules/tenant/models/tenant-product-attribute";

/**
 * Shared machinery of the product characteristics (t15-product-attributes):
 * the translation path, the typed-value coercion and the category scope.
 *
 * Imported by both `/tenants/product-attributes/**` (the owner's schema) and
 * `/store/tenant/product-attributes/**` (what a visitor reads), the way
 * `articles/article-helpers.ts` is shared with its store route.
 */

/** `reference` of a characteristic's `name` in the translation module. */
export const ATTRIBUTE_REFERENCE = "tenant_product_attribute";
/** `reference` of a choice's `label`. */
export const OPTION_REFERENCE = "tenant_product_attribute_option";

export type AttributeOptionRow = {
  id: string;
  value: string;
  label: string;
  position: number;
};

export type AttributeRow = {
  id: string;
  key: string;
  name: string;
  type: AttributeType;
  unit: string | null;
  position: number;
  category_id: string | null;
  show_on_product: boolean;
  use_as_filter: boolean;
};

export type TypedValue = {
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
};

/** What one characteristic of one product is, once typed and named. */
export type ResolvedValue = TypedValue & {
  key: string;
  name: string;
  type: AttributeType;
  unit: string | null;
  position: number;
  /** The machine value as the filter URL spells it, or null when unset. */
  value: string | number | boolean | null;
  /** A `select`'s value rendered through its choice label, else null. */
  label: string | null;
};

const badRequest = (message: string) =>
  new MedusaError(MedusaError.Types.INVALID_DATA, message);

/**
 * A submitted value in the column its type names, or `null` meaning «clear
 * this characteristic on this product».
 *
 * Empty text clears rather than storing `""`: a product page that renders an
 * empty row is exactly the «не указано» filler the task forbids, and a filter
 * facet built over `""` offers a choice nobody can read.
 *
 * `select` is checked against the declared choices, so a typo in an import
 * fails at the write rather than showing up as a one-product facet value
 * nobody can explain.
 */
export const coerceValue = (
  attribute: Pick<AttributeRow, "key" | "type">,
  options: AttributeOptionRow[],
  raw: string | number | boolean | null,
): TypedValue | null => {
  const empty: TypedValue = { value_text: null, value_number: null, value_boolean: null };

  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
    return null;
  }

  switch (attribute.type) {
    case "text":
      return { ...empty, value_text: String(raw).trim().slice(0, 2_000) };

    case "number": {
      // A comma is what a Russian keyboard produces for a decimal point, and
      // the panel's own number input hands it over unchanged.
      const parsed =
        typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
      if (!Number.isFinite(parsed)) {
        throw badRequest(
          `Characteristic "${attribute.key}" is a number, but "${String(raw)}" is not one.`,
        );
      }
      return { ...empty, value_number: parsed };
    }

    case "boolean": {
      if (typeof raw === "boolean") {
        return { ...empty, value_boolean: raw };
      }
      const asText = String(raw).trim().toLowerCase();
      if (["true", "1", "yes", "да"].includes(asText)) {
        return { ...empty, value_boolean: true };
      }
      if (["false", "0", "no", "нет"].includes(asText)) {
        return { ...empty, value_boolean: false };
      }
      throw badRequest(
        `Characteristic "${attribute.key}" is a yes/no, but "${String(raw)}" is neither.`,
      );
    }

    case "select": {
      const asText = String(raw).trim();
      const match = options.find((option) => option.value === asText);
      if (!match) {
        const known = options.map((option) => option.value).join(", ") || "none declared";
        throw badRequest(
          `Characteristic "${attribute.key}" has no choice "${asText}" (declared: ${known}).`,
        );
      }
      return { ...empty, value_text: match.value };
    }

    default:
      throw badRequest(`Characteristic "${attribute.key}" has an unknown type.`);
  }
};

/** The machine value of a stored row, in the shape a filter URL carries. */
export const machineValue = (
  type: AttributeType,
  row: TypedValue,
): string | number | boolean | null => {
  switch (type) {
    case "number":
      return row.value_number;
    case "boolean":
      return row.value_boolean;
    default:
      return row.value_text;
  }
};

// ---- translations

type TranslationService = {
  listTranslations: (filters: Record<string, unknown>) => Promise<
    { reference: string; reference_id: string; locale_code: string; translations: Record<string, unknown> }[]
  >;
  createTranslations: (data: unknown) => Promise<unknown>;
  updateTranslations: (data: unknown) => Promise<unknown>;
  listLocales: (filters: Record<string, unknown>) => Promise<{ code: string }[]>;
  createLocales: (data: { code: string; name: string }[]) => Promise<unknown>;
};

const translationService = (container: MedusaContainer): TranslationService =>
  container.resolve(Modules.TRANSLATION) as unknown as TranslationService;

/** `{ [reference_id]: { [locale]: { [field]: text } } }` for the rows asked for. */
export const readTranslations = async (
  container: MedusaContainer,
  reference: string,
  referenceIds: string[],
): Promise<Map<string, Map<string, Record<string, unknown>>>> => {
  const byId = new Map<string, Map<string, Record<string, unknown>>>();

  // An empty `reference_id` filter is NO filter to the module, which would
  // hand back every translation in the database.
  if (!referenceIds.length) {
    return byId;
  }

  const rows = await translationService(container).listTranslations({
    reference,
    reference_id: referenceIds,
  });

  for (const row of rows) {
    const byLocale = byId.get(row.reference_id) ?? new Map();
    byLocale.set(row.locale_code, row.translations ?? {});
    byId.set(row.reference_id, byLocale);
  }

  return byId;
};

/**
 * The visitor's own language, then its language part, then the base text the
 * owner typed. Never an empty string: a shop that has not translated «Состав»
 * shows «Состав» to an English visitor rather than a blank line, which is the
 * same chain `pickPageForLocale` walks for pages.
 */
export const pickTranslated = (
  base: string,
  byLocale: Map<string, Record<string, unknown>> | undefined,
  field: string,
  locale: string | undefined,
): string => {
  if (!byLocale || !locale) {
    return base;
  }

  const candidates = [locale];
  const languagePart = locale.split("-")[0];
  if (languagePart && languagePart !== locale) {
    candidates.push(languagePart);
  }

  for (const candidate of candidates) {
    const value = byLocale.get(candidate)?.[field];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }

  return base;
};

/**
 * Writes one field's translations for one row, replacing what stands there.
 *
 * The locale row itself is created when the shop is the first to use that
 * language: `translation.locale_code` points at the translation module's own
 * locale table, which the seed fills for the languages IT ships, not for the
 * 36 the storefront offers.
 */
export const writeTranslations = async (
  container: MedusaContainer,
  reference: string,
  referenceId: string,
  field: string,
  translations: Record<string, string> | undefined,
): Promise<void> => {
  if (!translations) {
    return;
  }

  const service = translationService(container);
  const wanted = Object.entries(translations).filter(([, text]) => text?.trim());

  const existing = await service.listTranslations({
    reference,
    reference_id: [referenceId],
  });
  const existingByLocale = new Map(existing.map((row) => [row.locale_code, row]));

  const locales = wanted.map(([code]) => code);
  if (locales.length) {
    const known = new Set((await service.listLocales({ code: locales })).map((row) => row.code));
    const missing = locales.filter((code) => !known.has(code));
    if (missing.length) {
      await service.createLocales(missing.map((code) => ({ code, name: code })));
    }
  }

  const creates: unknown[] = [];
  const updates: unknown[] = [];

  for (const [code, text] of wanted) {
    const row = existingByLocale.get(code);
    if (row) {
      updates.push({
        id: (row as unknown as { id: string }).id,
        translations: { ...row.translations, [field]: text.trim() },
      });
    } else {
      creates.push({
        reference,
        reference_id: referenceId,
        locale_code: code,
        translations: { [field]: text.trim() },
      });
    }
  }

  // A locale the owner cleared: drop the field, and the row with it when the
  // field was all it carried.
  for (const [code, row] of existingByLocale) {
    if (wanted.some(([wantedCode]) => wantedCode === code)) {
      continue;
    }
    const rest = { ...row.translations };
    delete rest[field];
    updates.push({ id: (row as unknown as { id: string }).id, translations: rest });
  }

  if (creates.length) {
    await service.createTranslations(creates);
  }
  if (updates.length) {
    await service.updateTranslations(updates);
  }
};

// ---- category scope

/**
 * Every category id in the subtree of the given ones, the given ones included.
 *
 * A characteristic declared on «Добавки» has to reach «Добавки / Витамины»
 * too: an owner who nests their catalog is not declaring composition twice.
 * `mpath` is Medusa's own materialised path on `product_category`, a dotted
 * chain of ancestor ids ending with the row itself, so one regex over it
 * answers for the whole subtree without walking it.
 */
export const listCategorySubtree = async (
  container: MedusaContainer,
  categoryIds: string[],
): Promise<Set<string>> => {
  const result = new Set(categoryIds);

  if (!categoryIds.length) {
    return result;
  }

  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const pattern = `(^|\\.)(${categoryIds.map((id) => id.replace(/[^A-Za-z0-9_]/g, "")).join("|")})(\\.|$)`;

  const rows = await pg
    .select("id")
    .from("product_category")
    .whereNull("deleted_at")
    .whereRaw("mpath ~ ?", [pattern]);

  for (const row of rows as { id: string }[]) {
    result.add(row.id);
  }

  return result;
};

/**
 * The characteristics that apply to one product: the tenant's catalog-wide
 * ones (`category_id` null) plus the ones declared on a category the product
 * sits in, or on an ancestor of it.
 */
export const applicableAttributes = async (
  container: MedusaContainer,
  attributes: AttributeRow[],
  productId: string,
): Promise<AttributeRow[]> => {
  const scoped = attributes.filter((attribute) => attribute.category_id);

  if (!scoped.length) {
    return attributes.filter((attribute) => !attribute.category_id);
  }

  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const rows = (await pg
    .select("product_category_id")
    .from("product_category_product")
    .where("product_id", productId)) as { product_category_id: string }[];

  const productCategoryIds = new Set(rows.map((row) => row.product_category_id));

  if (!productCategoryIds.size) {
    return attributes.filter((attribute) => !attribute.category_id);
  }

  // The declared category matches when the product sits in it or in one of its
  // descendants, so the subtree is computed per declared category id.
  const subtreeByCategory = new Map<string, Set<string>>();
  for (const attribute of scoped) {
    const categoryId = attribute.category_id as string;
    if (!subtreeByCategory.has(categoryId)) {
      subtreeByCategory.set(categoryId, await listCategorySubtree(container, [categoryId]));
    }
  }

  return attributes.filter((attribute) => {
    if (!attribute.category_id) {
      return true;
    }
    const subtree = subtreeByCategory.get(attribute.category_id);
    return Boolean(subtree && [...productCategoryIds].some((id) => subtree.has(id)));
  });
};

/** Ascending `position`, then `key`, so two rows saved at 0 keep a stable order. */
export const byPosition = <T extends { position: number; key?: string; value?: string }>(
  a: T,
  b: T,
): number => {
  if (a.position !== b.position) {
    return a.position - b.position;
  }
  return String(a.key ?? a.value ?? "").localeCompare(String(b.key ?? b.value ?? ""));
};
