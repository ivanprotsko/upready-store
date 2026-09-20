import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { deleteServiceZonesWorkflow, deleteShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";

export type DeleteTenantShippingMethodInput = {
  id: string;
  service_zone_id: string;
  own_zone: boolean;
};

/**
 * Removes one tenant method (Medusa soft-deletes the option, so an order that
 * shipped with it keeps its name) and, when the zone was the method's own, the
 * zone with it. The warehouse's base zone is never touched here.
 */
const deleteTenantShippingMethodWorkflow = createWorkflow(
  "delete-tenant-shipping-method",
  (input: DeleteTenantShippingMethodInput) => {
    const optionIds = transform({ input }, ({ input }) => ({ ids: [input.id] }));
    deleteShippingOptionsWorkflow.runAsStep({ input: optionIds });

    when("drop-own-zone", input, (input) => input.own_zone).then(() => {
      const zoneIds = transform({ input }, ({ input }) => ({ ids: [input.service_zone_id] }));
      return deleteServiceZonesWorkflow.runAsStep({ input: zoneIds });
    });

    return new WorkflowResponse(transform({ input }, ({ input }) => ({ id: input.id, deleted: true })));
  },
);

export default deleteTenantShippingMethodWorkflow;
