import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  setAuthAppMetadataStep,
} from "@medusajs/medusa/core-flows";
import { TENANT_ACTOR_TYPE } from "../../../modules/tenant";
import createTenantAdminStep from "./steps/create-tenant-admin";
import createTenantStep from "./steps/create-tenant";
import linkSalesChannelToStockLocationsStep from "./steps/link-sales-channel-to-stock-locations";

export type CreateTenantWorkflowInput = {
  name: string;
  handle: string;
  admin: {
    email: string;
    first_name?: string;
    last_name?: string;
  };
  /** The actorless auth identity from `/auth/tenant/emailpass/register`. */
  authIdentityId: string;
};

/**
 * Registers a tenant and its first admin. Compared with the recipe's
 * `createVendorWorkflow` this one also mints what makes the tenant a storefront
 * of its own on the shared backend: a sales channel, a publishable API key
 * linked to it, and the stock-location links checkout needs. All of it runs as
 * steps, so a failure anywhere rolls the whole registration back.
 */
const createTenantWorkflow = createWorkflow(
  "create-tenant",
  function (input: CreateTenantWorkflowInput) {
    const salesChannelsInput = transform({ input }, ({ input }) => ({
      salesChannelsData: [
        {
          name: input.name,
          description: `Sales channel of tenant "${input.handle}"`,
        },
      ],
    }));

    const salesChannels = createSalesChannelsWorkflow.runAsStep({
      input: salesChannelsInput,
    });

    const apiKeysInput = transform({ input }, ({ input }) => ({
      api_keys: [
        {
          title: `${input.name} storefront`,
          type: "publishable" as const,
          created_by: "",
        },
      ],
    }));

    const apiKeys = createApiKeysWorkflow.runAsStep({
      input: apiKeysInput,
    });

    const linkKeyInput = transform({ salesChannels, apiKeys }, (data) => ({
      id: data.apiKeys[0].id,
      add: [data.salesChannels[0].id],
    }));

    linkSalesChannelsToApiKeyWorkflow.runAsStep({
      input: linkKeyInput,
    });

    const stockLocationsInput = transform({ salesChannels }, (data) => ({
      sales_channel_id: data.salesChannels[0].id,
    }));

    linkSalesChannelToStockLocationsStep(stockLocationsInput);

    const tenantData = transform({ input, salesChannels, apiKeys }, (data) => ({
      name: data.input.name,
      handle: data.input.handle,
      sales_channel_id: data.salesChannels[0].id,
      publishable_api_key_id: data.apiKeys[0].id,
    }));

    const tenant = createTenantStep(tenantData);

    const tenantAdminData = transform({ input, tenant }, (data) => ({
      ...data.input.admin,
      tenant_id: data.tenant.id,
    }));

    const tenantAdmin = createTenantAdminStep(tenantAdminData);

    setAuthAppMetadataStep({
      authIdentityId: input.authIdentityId,
      actorType: TENANT_ACTOR_TYPE,
      value: tenantAdmin.id,
    });

    const result = transform({ tenant, tenantAdmin, apiKeys }, (data) => ({
      tenant: {
        ...data.tenant,
        admins: [data.tenantAdmin],
      },
      // The raw token is returned by the API Key Module only at creation
      // (api-key-module-service.js, "return the raw token"): this is the one
      // place the storefront's key can be read in clear.
      publishable_api_key: {
        id: data.apiKeys[0].id,
        token: data.apiKeys[0].token,
      },
    }));

    return new WorkflowResponse(result);
  },
);

export default createTenantWorkflow;
