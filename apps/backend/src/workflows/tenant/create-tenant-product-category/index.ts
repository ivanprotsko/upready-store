import type { CreateProductCategoryDTO } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import {
  createProductCategoriesWorkflow,
  createRemoteLinkStep,
} from "@medusajs/medusa/core-flows";
import { TENANT_MODULE } from "../../../modules/tenant";

export type CreateTenantProductCategoryWorkflowInput = {
  tenant_id: string;
  product_category: CreateProductCategoryDTO;
};

/**
 * Creates a product category and records the tenant as its owner in the same
 * transaction. Built like `createTenantProductWorkflow`: the Admin's own
 * `createProductCategoriesWorkflow` makes the row, `createRemoteLinkStep` writes
 * the tenant-product-category link, and a failure on the link compensates the
 * category away instead of leaving one nobody owns (a category without the link
 * is invisible to `/tenants/product-categories` and would only be reachable
 * from the staff Admin).
 *
 * The caller checks `parent_category_id` ownership before calling; the workflow
 * takes a `tenant_id` it is told, because the route read it from the token.
 */
const createTenantProductCategoryWorkflow = createWorkflow(
  "create-tenant-product-category",
  (input: CreateTenantProductCategoryWorkflowInput) => {
    const categoryData = transform({ input }, (data) => ({
      product_categories: [data.input.product_category],
    }));

    const createdCategories = createProductCategoriesWorkflow.runAsStep({
      input: categoryData,
    });

    const linksToCreate = transform({ createdCategories, input }, (data) =>
      data.createdCategories.map((category) => ({
        [TENANT_MODULE]: {
          tenant_id: data.input.tenant_id,
        },
        [Modules.PRODUCT]: {
          product_category_id: category.id,
        },
      })),
    );

    createRemoteLinkStep(linksToCreate);

    return new WorkflowResponse({
      product_category: createdCategories[0],
    });
  },
);

export default createTenantProductCategoryWorkflow;
