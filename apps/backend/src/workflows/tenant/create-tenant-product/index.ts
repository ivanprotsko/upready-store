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
import assertTenantSalesChannelStep from "./steps/assert-tenant-sales-channel";

export type CreateTenantProductWorkflowInput = {
  tenant_admin_id: string;
  product: CreateProductWorkflowInputDTO;
};

/**
 * Creates a product owned by the authenticated tenant admin's tenant. Two
 * things differ from the recipe's `createVendorProductWorkflow`: the product is
 * attached to the TENANT's sales channel (read through the tenant-sales-channel
 * link) rather than the store default, and any `sales_channels` in the request
 * body are replaced by it, so a tenant cannot publish into another tenant's
 * channel.
 */
const createTenantProductWorkflow = createWorkflow(
  "create-tenant-product",
  (input: CreateTenantProductWorkflowInput) => {
    const { data: tenantAdmins } = useQueryGraphStep({
      entity: "tenant_admin",
      fields: ["id", "tenant.id", "tenant.sales_channel.id"],
      filters: {
        id: input.tenant_admin_id,
      },
      options: {
        throwIfKeyNotFound: true,
      },
    });

    const channelCheck = transform({ tenantAdmins }, (data) => ({
      tenant_id: data.tenantAdmins[0].tenant?.id as string,
      sales_channel_id: data.tenantAdmins[0].tenant?.sales_channel?.id as string | undefined,
    }));

    const salesChannelId = assertTenantSalesChannelStep(channelCheck);

    // t04-shipping-tariffs: a product without a shipping profile is invisible
    // to shipping-price calculation — `filterCartItemsByShippingProfile`
    // (core-flows) keeps only lines whose product carries the option's
    // profile, so a weightless-by-omission product priced a 2.4 kg cart as
    // 0 kg (measured 2026-09-15 on :9051). The panel's form sends the profile;
    // an API client that omits it gets the store's default one.
    const { data: shippingProfiles } = useQueryGraphStep({
      entity: "shipping_profile",
      fields: ["id"],
      pagination: { take: 1, order: { created_at: "ASC" } },
    }).config({ name: "default-shipping-profile-query" });

    const productData = transform({ input, salesChannelId, shippingProfiles }, (data) => {
      const shippingProfileId =
        data.input.product.shipping_profile_id ?? data.shippingProfiles[0]?.id ?? undefined;
      return {
        products: [
          {
            ...data.input.product,
            ...(shippingProfileId ? { shipping_profile_id: shippingProfileId } : {}),
            sales_channels: [
              {
                id: data.salesChannelId,
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
