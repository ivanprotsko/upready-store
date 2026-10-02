import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { notifyStorefrontRevalidate } from "../../../../../storefront-revalidate";
import { assertOwnedProduct, getTenantScope } from "../../../tenant-scope";
import {
  PRODUCT_OPTION_REFERENCE,
  PRODUCT_REFERENCE,
  PRODUCT_VARIANT_REFERENCE,
  readTranslationsByLocale,
  upsertTranslationFields,
} from "../../translations-helpers";
import type { PutTenantProductTranslationBodyType } from "../../translations-validators";

type ProductRow = {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  options: { id: string; title: string }[];
  variants: { id: string; title: string }[];
};

const loadProduct = async (
  req: AuthenticatedMedusaRequest,
  productId: string,
): Promise<ProductRow> => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const {
    data: [product],
  } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "subtitle",
      "description",
      "options.id",
      "options.title",
      "variants.id",
      "variants.title",
    ],
    filters: { id: productId },
  });

  if (!product) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Product with id "${productId}" was not found`,
    );
  }

  return product as unknown as ProductRow;
};

/**
 * Builds the `{ [locale]: {...} }` payload both verbs answer with: the
 * product's own text, its options and its variants, each per locale they
 * have been translated into. A locale with no row for the product AND none
 * for any option or variant does not appear at all — the drawer's language
 * picker offers every one of the 36 shipped locales regardless
 * (`LOCALE_CODES`), so an empty result here means "pick one and start typing",
 * never a gap to fill silently.
 */
const buildLocalesPayload = (
  product: ProductRow,
  productTranslations: Map<string, Map<string, Record<string, unknown>>>,
  optionTranslations: Map<string, Map<string, Record<string, unknown>>>,
  variantTranslations: Map<string, Map<string, Record<string, unknown>>>,
) => {
  const locales = new Set<string>();
  const byId = productTranslations.get(product.id);
  for (const locale of byId?.keys() ?? []) locales.add(locale);
  for (const option of product.options) {
    for (const locale of optionTranslations.get(option.id)?.keys() ?? []) locales.add(locale);
  }
  for (const variant of product.variants) {
    for (const locale of variantTranslations.get(variant.id)?.keys() ?? []) locales.add(locale);
  }

  const result: Record<
    string,
    {
      title?: string;
      subtitle?: string;
      description?: string;
      options: Record<string, string>;
      variants: Record<string, string>;
    }
  > = {};

  for (const locale of locales) {
    const productFields = byId?.get(locale) ?? {};
    const options: Record<string, string> = {};
    for (const option of product.options) {
      const value = optionTranslations.get(option.id)?.get(locale)?.title;
      if (typeof value === "string" && value) options[option.id] = value;
    }
    const variants: Record<string, string> = {};
    for (const variant of product.variants) {
      const value = variantTranslations.get(variant.id)?.get(locale)?.title;
      if (typeof value === "string" && value) variants[variant.id] = value;
    }

    result[locale] = {
      ...(typeof productFields.title === "string" && productFields.title
        ? { title: productFields.title }
        : {}),
      ...(typeof productFields.subtitle === "string" && productFields.subtitle
        ? { subtitle: productFields.subtitle }
        : {}),
      ...(typeof productFields.description === "string" && productFields.description
        ? { description: productFields.description }
        : {}),
      options,
      variants,
    };
  }

  return result;
};

/**
 * `GET /tenants/products/:id/translations` — the panel's «Переводы» drawer
 * (t-cherk-37). Answers the product's own title/subtitle/description, its
 * options and variants (id + title, for the drawer to label the rows it
 * renders), and every locale translated so far.
 */
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await assertOwnedProduct(req, req.params.id);
  const product = await loadProduct(req, req.params.id);

  const [productTranslations, optionTranslations, variantTranslations] = await Promise.all([
    readTranslationsByLocale(req.scope, [product.id]),
    readTranslationsByLocale(req.scope, product.options.map((option) => option.id)),
    readTranslationsByLocale(req.scope, product.variants.map((variant) => variant.id)),
  ]);

  res.json({
    product: {
      id: product.id,
      title: product.title,
      subtitle: product.subtitle,
      description: product.description,
    },
    options: product.options.map((option) => ({ id: option.id, title: option.title })),
    variants: product.variants.map((variant) => ({ id: variant.id, title: variant.title })),
    locales: buildLocalesPayload(
      product,
      productTranslations,
      optionTranslations,
      variantTranslations,
    ),
  });
};

/**
 * `PUT /tenants/products/:id/translations` — saves ONE locale. Unknown option
 * or variant ids answer `INVALID_DATA` rather than being written anyway: a
 * ghost id reaching the Translation module would be invisible from this
 * screen forever, since the GET side only ever asks about THIS product's own
 * options and variants.
 *
 * Store routes (catalogue, product page, cart, search) pick this up on their
 * own once `MEDUSA_FF_TRANSLATION` is on — Medusa's own Store API and cart
 * workflows apply the Translation module's rows by entity id
 * (`@medusajs/utils` `applyTranslations`), with the original text as the
 * fallback when a locale has none. Nothing here calls the Store API.
 */
export const PUT = async (
  req: AuthenticatedMedusaRequest<PutTenantProductTranslationBodyType>,
  res: MedusaResponse,
) => {
  const scope = await getTenantScope(req);
  await assertOwnedProduct(req, req.params.id);
  const product = await loadProduct(req, req.params.id);
  const body = req.validatedBody;

  const optionIds = new Set(product.options.map((option) => option.id));
  const variantIds = new Set(product.variants.map((variant) => variant.id));

  for (const id of Object.keys(body.options ?? {})) {
    if (!optionIds.has(id)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Invalid request: option "${id}" does not belong to this product`,
      );
    }
  }
  for (const id of Object.keys(body.variants ?? {})) {
    if (!variantIds.has(id)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Invalid request: variant "${id}" does not belong to this product`,
      );
    }
  }

  await upsertTranslationFields(req.scope, PRODUCT_REFERENCE, product.id, body.locale, {
    title: body.title,
    subtitle: body.subtitle === null ? "" : body.subtitle,
    description: body.description === null ? "" : body.description,
  });

  await Promise.all(
    Object.entries(body.options ?? {}).map(([optionId, title]) =>
      upsertTranslationFields(req.scope, PRODUCT_OPTION_REFERENCE, optionId, body.locale, {
        title,
      }),
    ),
  );
  await Promise.all(
    Object.entries(body.variants ?? {}).map(([variantId, title]) =>
      upsertTranslationFields(req.scope, PRODUCT_VARIANT_REFERENCE, variantId, body.locale, {
        title,
      }),
    ),
  );

  // The core `translation.updated` event already clears the storefront's
  // catalog cache (`src/subscribers/product-updated.ts`,
  // `apps/storefront/src/app/api/revalidate/clearings.ts`'s `translation`
  // entry) for a write made through the Translation module's OWN workflows.
  // `upsertTranslationFields` calls the service directly, the way
  // `product-attributes/helpers.ts`'s `writeTranslations` does, which emits no
  // domain event — so this call is the one that actually drops the cache.
  await notifyStorefrontRevalidate({ type: "translation.updated", id: product.id, handle: scope.handle });

  const refreshed = await loadProduct(req, req.params.id);
  const [productTranslations, optionTranslations, variantTranslations] = await Promise.all([
    readTranslationsByLocale(req.scope, [refreshed.id]),
    readTranslationsByLocale(req.scope, refreshed.options.map((option) => option.id)),
    readTranslationsByLocale(req.scope, refreshed.variants.map((variant) => variant.id)),
  ]);

  res.json({
    product: {
      id: refreshed.id,
      title: refreshed.title,
      subtitle: refreshed.subtitle,
      description: refreshed.description,
    },
    options: refreshed.options.map((option) => ({ id: option.id, title: option.title })),
    variants: refreshed.variants.map((variant) => ({ id: variant.id, title: variant.title })),
    locales: buildLocalesPayload(
      refreshed,
      productTranslations,
      optionTranslations,
      variantTranslations,
    ),
  });
};
