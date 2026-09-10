import type { CreateProductWorkflowInputDTO } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import {
  createProductsWorkflow,
  type CreateProductsWorkflowInput,
  createRemoteLinkStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows";
import { TENANT_MODULE } from "../../../modules/tenant";

export type CreateTenantProductWorkflowInput = {
  tenant_admin_id: string;
  product: CreateProductWorkflowInputDTO;
};

/**
 * Creates a product owned by the authenticated tenant admin's tenant. Two
 * things differ from the recipe's `createVendorProductWorkflow`: the product is
 * attached to the TENANT's sales channel rather than the store default, and any
 * `sales_channels` in the request body are replaced by it, so a tenant cannot
 * publish into another tenant's channel.
 */
const createTenantProductWorkflow = createWorkflow(
  "create-tenant-product",
  (input: CreateTenantProductWorkflowInput) => {
    const { data: tenantAdmins } = useQueryGraphStep({
      entity: "tenant_admin",
      fields: ["id", "tenant.id", "tenant.sales_channel_id"],
      filters: {
        id: input.tenant_admin_id,
      },
      options: {
        throwIfKeyNotFound: true,
      },
    });

    const productData = transform({ input, tenantAdmins }, (data) => {
      return {
        products: [
          {
            ...data.input.product,
            sales_channels: [
              {
                id: data.tenantAdmins[0].tenant.sales_channel_id,
              },
            ],
          },
        ],
      };
    });

    const createdProducts = createProductsWorkflow.runAsStep({
      input: productData as CreateProductsWorkflowInput,
    });

    const linksToCreate = transform({ createdProducts, tenantAdmins }, (data) => {
      return data.createdProducts.map((product) => {
        return {
          [TENANT_MODULE]: {
            tenant_id: data.tenantAdmins[0].tenant.id,
          },
          [Modules.PRODUCT]: {
            product_id: product.id,
          },
        };
      });
    });

    createRemoteLinkStep(linksToCreate);

    const { data: products } = useQueryGraphStep({
      entity: "product",
      fields: ["*", "variants.*", "sales_channels.*"],
      filters: {
        id: createdProducts[0].id,
      },
    }).config({ name: "retrieve-products" });

    return new WorkflowResponse({
      product: products[0],
    });
  },
);

export default createTenantProductWorkflow;
