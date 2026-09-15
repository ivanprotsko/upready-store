import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import tenantProductLink from "../../src/links/tenant-product";

/**
 * b08-seo-storefront — acceptance fixture ONLY, outside `src/` for the reason
 * `scripts/fixtures/README.md` gives.
 *
 * Gives each of two tenants on a stand one collection of its own, so
 * `/store/tenant/collections` can be measured in BOTH directions: each shop
 * lists the collection its own products sit in, and neither lists the other's.
 * A stand where no product sits in any collection would show the same "0 shared
 * paths" while proving only that the section is empty.
 *
 *   B08_TENANT_A=cherkashino B08_TENANT_B=acme \
 *   npx medusa exec ./scripts/fixtures/b08-collections-stand.ts
 */
export default async function seedCollectionsStand({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const productModuleService = container.resolve(Modules.PRODUCT);

  const handles = [process.env.B08_TENANT_A ?? "cherkashino", process.env.B08_TENANT_B ?? "acme"];

  for (const handle of handles) {
    const { data: tenants } = await query.graph({
      entity: "tenant",
      fields: ["id", "handle"],
      filters: { handle: [handle] },
    });
    const tenant = tenants[0] as { id: string; handle: string } | undefined;
    if (!tenant) {
      throw new Error(`b08-collections-stand: no tenant with handle "${handle}"`);
    }

    const { data: links } = await query.graph({
      entity: tenantProductLink.entryPoint,
      fields: ["product_id"],
      filters: { tenant_id: tenant.id },
    });
    const productId = (links[0] as { product_id?: string } | undefined)?.product_id;
    if (!productId) {
      throw new Error(`b08-collections-stand: tenant "${handle}" owns no product`);
    }

    const collectionHandle = `${handle}-picks`;
    const [existing] = await productModuleService.listProductCollections({
      handle: collectionHandle,
    });
    const collection =
      existing ??
      (
        await productModuleService.createProductCollections([
          { title: `${handle} picks`, handle: collectionHandle },
        ])
      )[0];

    await productModuleService.updateProducts(productId, { collection_id: collection.id });

    logger.info(
      `b08-collections-stand: ${handle} — product ${productId} now sits in collection ${collection.handle} (${collection.id})`,
    );
  }
}
