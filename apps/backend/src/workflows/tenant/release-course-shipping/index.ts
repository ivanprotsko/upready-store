import type { LinkDefinition } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import {
  dismissRemoteLinkStep,
  updateInventoryItemsStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows";

export type ReleaseCourseShippingWorkflowInput = {
  /** Never empty: the callers run this only for the products they mean. */
  product_ids: string[];
};

/** `product.metadata.digital === "true"`: the course marker the storefront and the seeds already use. */
export const isDigitalProduct = (metadata: Record<string, unknown> | null | undefined): boolean =>
  metadata?.digital === "true";

type ProductShippingRow = {
  id: string;
  shipping_profile?: { id: string } | null;
  variants?:
    | {
        inventory_items?: { inventory?: { id: string; requires_shipping: boolean } | null }[] | null;
      }[]
    | null;
};

/**
 * Takes a course product off shipping (t-cherk-com-hotfix batch 5). Medusa
 * 2.19 marks a cart line `requires_shipping` when the product has a shipping
 * profile OR any inventory item of its variant requires shipping
 * (`core-flows/dist/cart/utils/prepare-line-item-data.js`), and it reads the
 * inventory items whatever `manage_inventory` says. So both go: the
 * product–shipping-profile link is dismissed and every linked inventory item
 * gets `requires_shipping: false`. A cart line added after this has
 * `requires_shipping: false`, the checkout asks for no address or shipping
 * method, and `completeCart` needs none (`validateShippingStep` counts only
 * lines that require shipping). A line already in a cart keeps its old value.
 *
 * Both core steps undo themselves on a failure later in the caller's workflow.
 */
const releaseCourseShippingWorkflow = createWorkflow(
  "release-course-shipping",
  (input: ReleaseCourseShippingWorkflowInput) => {
    const { data: products } = useQueryGraphStep({
      entity: "product",
      fields: [
        "id",
        "shipping_profile.id",
        "variants.inventory_items.inventory.id",
        "variants.inventory_items.inventory.requires_shipping",
      ],
      filters: { id: input.product_ids },
    }).config({ name: "course-shipping-products" });

    const plan = transform({ products }, ({ products }) => {
      const rows = products as ProductShippingRow[];
      const links: LinkDefinition[] = rows
        .filter((product) => product.shipping_profile?.id)
        .map((product) => ({
          [Modules.PRODUCT]: { product_id: product.id },
          [Modules.FULFILLMENT]: { shipping_profile_id: product.shipping_profile!.id },
        }));
      const inventoryIds = new Set<string>();
      for (const product of rows) {
        for (const variant of product.variants ?? []) {
          for (const item of variant.inventory_items ?? []) {
            if (item.inventory?.requires_shipping) {
              inventoryIds.add(item.inventory.id);
            }
          }
        }
      }
      return {
        links,
        inventory: Array.from(inventoryIds).map((id) => ({ id, requires_shipping: false })),
      };
    });

    dismissRemoteLinkStep(plan.links).config({ name: "dismiss-course-shipping-profile" });
    updateInventoryItemsStep(plan.inventory).config({ name: "course-inventory-without-shipping" });

    const result = transform({ plan }, ({ plan }) => ({
      shipping_profiles_detached: plan.links.length,
      inventory_items_released: plan.inventory.map((item) => item.id),
    }));

    return new WorkflowResponse(result);
  },
);

export default releaseCourseShippingWorkflow;
