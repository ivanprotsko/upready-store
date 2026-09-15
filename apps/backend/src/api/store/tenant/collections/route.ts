import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import tenantProductLink from "../../../../links/tenant-product";
import { resolveTenantFromPublishableKey } from "../resolve-tenant";

/**
 * `GET /store/tenant/collections` — the collections one tenant's OWN products
 * sit in, for its storefront.
 *
 * `/store/collections`, unlike `/store/products`, is not scoped by the
 * publishable key: a collection carries no sales-channel link in Medusa, so
 * every shop's collections answer there. That is what put 36 shared
 * `/<locale>/collections/new` paths into two tenants' sitemaps at once
 * (b08-seo-storefront, measured on the b02 stand: `acme` and `cherkashino`
 * shared exactly those 36 and no product, category or page path).
 *
 * There is no tenant-collection link to scope by, and inventing one would
 * claim an ownership nobody records: a collection is reference data, shared by
 * design. The OWNERSHIP that does exist is the product's — `tenant_product`
 * says which shop created a product, and `product.collection_id` says which
 * collection that product sits in. A collection reachable from a tenant's own
 * products is the tenant's to list; one nobody's product points at belongs to
 * no shop's sitemap.
 *
 * The response is `/store/collections`'s own shape and parameters
 * (`StoreGetCollectionsParams` + `listTransformQueryConfig`, wired in
 * `src/api/middlewares.ts`), so a storefront can swap one URL for the other.
 */
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const tenant = await resolveTenantFromPublishableKey(req);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const { data: links } = await query.graph({
    entity: tenantProductLink.entryPoint,
    fields: ["product_id"],
    filters: { tenant_id: tenant.id },
  });

  const productIds = links
    .map((link) => link?.product_id as string | undefined)
    .filter((id): id is string => Boolean(id));

  const ownedIds = new Set<string>();

  if (productIds.length) {
    const { data: products } = await query.graph({
      entity: "product",
      fields: ["collection_id"],
      filters: { id: productIds },
    });

    for (const product of products) {
      const collectionId = product?.collection_id as string | null | undefined;
      if (collectionId) {
        ownedIds.add(collectionId);
      }
    }
  }

  const requested = req.filterableFields?.id;
  const wanted =
    requested === undefined || requested === null
      ? [...ownedIds]
      : [...ownedIds].filter((id) =>
          (Array.isArray(requested) ? requested : [requested]).includes(id),
        );

  if (wanted.length === 0) {
    res.json({
      collections: [],
      count: 0,
      offset: req.queryConfig?.pagination?.skip ?? 0,
      limit: req.queryConfig?.pagination?.take ?? 0,
    });
    return;
  }

  const { data: collections, metadata } = await query.graph(
    {
      entity: "product_collection",
      fields: req.queryConfig.fields,
      filters: { ...req.filterableFields, id: wanted },
      pagination: req.queryConfig.pagination,
    },
    { locale: req.locale },
  );

  res.json({
    collections,
    count: metadata?.count,
    offset: metadata?.skip,
    limit: metadata?.take,
  });
};
