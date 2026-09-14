import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { IFulfillmentModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

/**
 * Returns the id of a shipping profile to hang the tenant's options on,
 * creating a default one only if the backend has none.
 *
 * A fully seeded backend already carries the starter's shipping profile, so
 * this finds it and creates nothing (compensation is a no-op). A bare backend
 * — a throwaway integration-test database migrated without the seed — has no
 * profile, and shipping options cannot be created without one; there the step
 * creates a `default` profile and its compensation removes exactly that one.
 * Every tenant shares the one profile, the same way the seed's own options do.
 */
const resolveDefaultShippingProfileStep = createStep(
  "resolve-default-shipping-profile",
  async (_input: void, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data: profiles } = await query.graph({
      entity: "shipping_profile",
      fields: ["id"],
      pagination: { take: 1 },
    });

    if (profiles.length > 0) {
      return new StepResponse<string, string | null>(profiles[0].id, null);
    }

    const fulfillment: IFulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
    const profile = await fulfillment.createShippingProfiles({
      name: "Default",
      type: "default",
    });

    return new StepResponse<string, string | null>(profile.id, profile.id);
  },
  async (createdProfileId, { container }) => {
    if (!createdProfileId) {
      return;
    }
    const fulfillment: IFulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
    await fulfillment.deleteShippingProfiles(createdProfileId);
  },
);

export default resolveDefaultShippingProfileStep;
