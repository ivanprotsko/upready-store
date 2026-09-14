import type { CreateProductWorkflowInputDTO } from "@medusajs/framework/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { createStep, createWorkflow, StepResponse, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import {
  createCollectionsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRemoteLinkStep,
  type CreateProductsWorkflowInput,
} from "@medusajs/medusa/core-flows";
import { TENANT_MODULE } from "../../../modules/tenant";
import type { SeedPlan } from "../../../migration-scripts/data/abstract-datasets";

export type SeedTenantDatasetWorkflowInput = {
  tenant_id: string;
  sales_channel_id: string;
  shipping_profile_id: string;
  plan: SeedPlan;
};

/** Medusa's own name for the option a single-variant product gets when it has none. */
const DEFAULT_OPTION_TITLE = "Default option";

/**
 * Find-or-join the SHARED library option for every option the plan's products choose from,
 * contributing the plan's values (the UNION with what is there — `updateProductOptions`
 * replaces the value set, and a value another shop's variants use must survive). Mirrors
 * `seedProductOptions` in `migration-scripts/lib/products.ts`, the path the seeded shops on
 * prod took, where one "Size" filter stands on `/store`.
 *
 * No compensation: a library row is global and idempotent (find-or-create by title), and
 * removing it on a later failure would take the values other shops already use.
 */
const ensureSharedProductOptionsStep = createStep(
  "ensure-shared-product-options",
  async (input: { options: { title: string; values: string[] }[] }, { container }) => {
    const optionIdsByTitle: Record<string, string> = {};
    if (!input.options.length) return new StepResponse({ option_ids_by_title: optionIdsByTitle });

    const productModuleService = container.resolve(Modules.PRODUCT);
    const existing = (
      await productModuleService.listProductOptions(
        { title: input.options.map((option) => option.title) },
        { relations: ["values"] },
      )
    ).filter((option) => option.is_exclusive === false);
    const existingByTitle = new Map(existing.map((option) => [option.title, option]));

    for (const option of input.options) {
      const shared = existingByTitle.get(option.title);
      if (!shared) {
        const [created] = await productModuleService.createProductOptions([{ title: option.title, values: option.values }]);
        optionIdsByTitle[option.title] = created.id;
        continue;
      }
      const have = (shared.values ?? []).map((optionValue) => optionValue.value);
      const seen = new Set(have);
      const added = option.values.filter((value) => !seen.has(value));
      if (added.length) {
        await productModuleService.updateProductOptions(shared.id, { values: [...have, ...added] });
      }
      optionIdsByTitle[option.title] = shared.id;
    }
    return new StepResponse({ option_ids_by_title: optionIdsByTitle });
  },
);

/**
 * Gives one tenant its own copy of an abstract dataset (specs/catalog-taxonomy/ABSTRACT-DATASETS.md
 * §4): the category tree with its images and the tenant-category links, the collections, the
 * products with variants, prices and images on the tenant's sales channel, and the
 * tenant-product links. Built from the same Admin workflows `createTenantProductWorkflow` and
 * `createTenantProductCategoryWorkflow` use, run as steps, so a failure half-way compensates
 * every row already written instead of leaving a shop with categories and no products.
 *
 * The plan is computed BEFORE the workflow (`buildSeedPlan`, pure): this workflow only writes.
 */
const seedTenantDatasetWorkflow = createWorkflow(
  "seed-tenant-dataset",
  (input: SeedTenantDatasetWorkflowInput) => {
    // 1. root categories
    const rootsInput = transform({ input }, ({ input }) => ({
      product_categories: input.plan.categories.map((root) => ({
        name: root.name,
        handle: root.handle,
        is_active: true,
        metadata: root.metadata,
      })),
    }));
    const roots = createProductCategoriesWorkflow.runAsStep({ input: rootsInput }).config({ name: "create-root-categories" });

    // 2. leaf categories, parented on the roots just made
    const leavesInput = transform({ input, roots }, ({ input, roots }) => {
      const rootIdByHandle = new Map((roots as { id: string; handle: string }[]).map((c) => [c.handle, c.id]));
      return {
        product_categories: input.plan.categories.flatMap((root) =>
          root.children.map((leaf) => ({
            name: leaf.name,
            handle: leaf.handle,
            is_active: true,
            parent_category_id: rootIdByHandle.get(root.handle),
            metadata: leaf.metadata,
          })),
        ),
      };
    });
    const leaves = createProductCategoriesWorkflow.runAsStep({ input: leavesInput }).config({ name: "create-leaf-categories" });

    // 3. the tenant owns every category (links/tenant-product-category.ts is the ownership record)
    const categoryLinks = transform({ input, roots, leaves }, ({ input, roots, leaves }) =>
      [...(roots as { id: string }[]), ...(leaves as { id: string }[])].map((category) => ({
        [TENANT_MODULE]: { tenant_id: input.tenant_id },
        [Modules.PRODUCT]: { product_category_id: category.id },
      })),
    );
    createRemoteLinkStep(categoryLinks).config({ name: "link-categories-to-tenant" });

    // 4. collections
    const collectionsInput = transform({ input }, ({ input }) => ({
      collections: input.plan.collections.map((c) => ({ title: c.title, handle: c.handle })),
    }));
    const collections = createCollectionsWorkflow.runAsStep({ input: collectionsInput });

    // 5. the shared library options the products choose from (one "Size" row for everyone)
    const sharedOptionsInput = transform({ input }, ({ input }) => ({ options: input.plan.sharedOptions }));
    const sharedOptions = ensureSharedProductOptionsStep(sharedOptionsInput);

    // 6. products, filed under their leaf and collection, on the tenant's channel
    const productsInput = transform({ input, leaves, collections, sharedOptions }, ({ input, leaves, collections, sharedOptions }) => {
      const leafIdBySource = new Map<string, string>();
      for (const leaf of leaves as { id: string; handle: string }[]) {
        const source = input.plan.categories.flatMap((r) => r.children).find((c) => c.handle === leaf.handle);
        if (source) leafIdBySource.set(source.sourceHandle, leaf.id);
      }
      const collectionIdBySource = new Map<string, string>();
      for (const collection of collections as { id: string; handle: string }[]) {
        const source = input.plan.collections.find((c) => c.handle === collection.handle);
        if (source) collectionIdBySource.set(source.sourceHandle, collection.id);
      }

      const products: CreateProductWorkflowInputDTO[] = input.plan.products.map((product) => {
        const categoryId = leafIdBySource.get(product.categorySourceHandle);
        if (!categoryId) {
          throw new MedusaError(
            MedusaError.Types.UNEXPECTED_STATE,
            `seed-tenant-dataset: product "${product.sourceHandle}" names category "${product.categorySourceHandle}", which was not created.`,
          );
        }
        return {
          title: product.title,
          handle: product.handle,
          ...(product.subtitle ? { subtitle: product.subtitle } : {}),
          description: product.description,
          status: "published",
          weight: product.weight,
          metadata: product.metadata,
          category_ids: [categoryId],
          ...(product.collectionSourceHandle && collectionIdBySource.get(product.collectionSourceHandle)
            ? { collection_id: collectionIdBySource.get(product.collectionSourceHandle) }
            : {}),
          shipping_profile_id: input.shipping_profile_id,
          images: product.images.map((url) => ({ url })),
          thumbnail: product.thumbnail,
          // A real option is referenced by the shared row's id (title/values inline would mint
          // a private, exclusive copy per product); Medusa's placeholder option stays inline,
          // as it is private to a single-variant product by design.
          options: product.options.map((option) => {
            if (option.title === DEFAULT_OPTION_TITLE) return option;
            const optionId = sharedOptions.option_ids_by_title[option.title];
            if (!optionId) {
              throw new MedusaError(
                MedusaError.Types.UNEXPECTED_STATE,
                `seed-tenant-dataset: product "${product.sourceHandle}" uses option "${option.title}", which the plan's sharedOptions does not list.`,
              );
            }
            return { id: optionId };
          }),
          variants: product.variants,
          sales_channels: [{ id: input.sales_channel_id }],
        };
      });

      return { products };
    });
    const products = createProductsWorkflow.runAsStep({ input: productsInput as CreateProductsWorkflowInput });

    // 6. the tenant owns every product (the same link createTenantProductWorkflow writes)
    const productLinks = transform({ input, products }, ({ input, products }) =>
      (products as { id: string }[]).map((product) => ({
        [TENANT_MODULE]: { tenant_id: input.tenant_id },
        [Modules.PRODUCT]: { product_id: product.id },
      })),
    );
    createRemoteLinkStep(productLinks).config({ name: "link-products-to-tenant" });

    const summary = transform({ roots, leaves, collections, products }, ({ roots, leaves, collections, products }) => ({
      category_ids: [...(roots as { id: string }[]), ...(leaves as { id: string }[])].map((c) => c.id),
      collection_ids: (collections as { id: string }[]).map((c) => c.id),
      product_ids: (products as { id: string }[]).map((p) => p.id),
    }));

    return new WorkflowResponse(summary);
  },
);

export default seedTenantDatasetWorkflow;
