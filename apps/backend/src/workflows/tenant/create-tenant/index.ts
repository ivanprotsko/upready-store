import type { LinkDefinition } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import assertHandleAvailableStep from "../shared/steps/assert-handle-available";
import {
  createApiKeysWorkflow,
  createRemoteLinkStep,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  setAuthAppMetadataStep,
} from "@medusajs/medusa/core-flows";
import { TENANT_ACTOR_TYPE, TENANT_MODULE } from "../../../modules/tenant";
import provisionTenantWarehouseWorkflow from "../provision-tenant-warehouse";
import addPlatformAdminToTenantStep from "./steps/add-platform-admin-to-tenant";
import createTenantAdminStep from "./steps/create-tenant-admin";
import createTenantStep from "./steps/create-tenant";

export type CreateTenantWorkflowInput = {
  name: string;
  handle: string;
  admin: {
    email: string;
    first_name?: string;
    last_name?: string;
  };
  /**
   * The actorless auth identity from `/auth/tenant/emailpass/register`, which
   * this workflow points at the new admin row. Absent when the admin already
   * logs in elsewhere and keeps doing so: `clone-tenant` (t-2026-09-24-n12)
   * adds a site for an owner whose login must keep opening the site it opens
   * today, and who reaches the new one through `POST /tenants/me/switch`.
   */
  authIdentityId?: string;
};

/**
 * Registers a tenant and its first admin. Compared with the recipe's
 * `createVendorWorkflow` this one also mints what makes the tenant a storefront
 * of its own on the shared backend: a sales channel, a publishable API key
 * linked to it, and — through `provisionTenantWarehouseWorkflow` — the tenant's
 * OWN warehouse (one stock location, a base service zone, two flat shipping
 * options) so checkout works from the first minute on isolated stock and
 * shipping. The channel and the key are attached to the tenant as module links
 * (tenant-sales-channel, tenant-api-key) by `createRemoteLinkStep`, whose
 * compensation dismisses them. All of it runs as steps, so a failure anywhere
 * rolls the whole registration back.
 */
const createTenantWorkflow = createWorkflow(
  "create-tenant",
  function (input: CreateTenantWorkflowInput) {
    // A handle another shop holds or ever held is refused before anything is
    // written (specs/tenant-address/CANONICAL.md §1.2).
    assertHandleAvailableStep({ handle: input.handle });

    const salesChannelsInput = transform({ input }, ({ input }) => ({
      salesChannelsData: [
        {
          name: input.name,
          description: `Канал продаж магазина «${input.handle}»`,
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

    const warehouseInput = transform({ input, salesChannels }, (data) => ({
      sales_channel_id: data.salesChannels[0].id,
      tenant_name: data.input.name,
    }));

    provisionTenantWarehouseWorkflow.runAsStep({
      input: warehouseInput,
    });

    const tenantData = transform({ input }, ({ input }) => ({
      name: input.name,
      handle: input.handle,
    }));

    const tenant = createTenantStep(tenantData);

    const linksToCreate = transform({ tenant, salesChannels, apiKeys }, (data): LinkDefinition[] => [
      {
        [TENANT_MODULE]: { tenant_id: data.tenant.id },
        [Modules.SALES_CHANNEL]: { sales_channel_id: data.salesChannels[0].id },
      },
      {
        [TENANT_MODULE]: { tenant_id: data.tenant.id },
        [Modules.API_KEY]: { api_key_id: data.apiKeys[0].id },
      },
    ]);

    createRemoteLinkStep(linksToCreate);

    const platformAdminInput = transform({ tenant }, (data) => ({ tenant_id: data.tenant.id }));

    addPlatformAdminToTenantStep(platformAdminInput);

    const tenantAdminData = transform({ input, tenant }, (data) => ({
      ...data.input.admin,
      tenant_id: data.tenant.id,
    }));

    const tenantAdmin = createTenantAdminStep(tenantAdminData);

    when("point-auth-identity", input, (input) => Boolean(input.authIdentityId)).then(() => {
      setAuthAppMetadataStep({
        authIdentityId: input.authIdentityId as string,
        actorType: TENANT_ACTOR_TYPE,
        value: tenantAdmin.id,
      });
    });

    // The same shape `GET /tenants/me` returns through the links, so a client
    // reads the tenant's channel and key from either place alike. The key's
    // raw token comes from the API Key Module at creation; for a publishable
    // key it is stored in clear as well, so `/tenants/me` shows it again.
    const result = transform({ tenant, tenantAdmin, salesChannels, apiKeys }, (data) => ({
      tenant: {
        ...data.tenant,
        admins: [data.tenantAdmin],
        sales_channel: {
          id: data.salesChannels[0].id,
          name: data.salesChannels[0].name,
        },
        api_key: {
          id: data.apiKeys[0].id,
          token: data.apiKeys[0].token,
          title: data.apiKeys[0].title,
          type: data.apiKeys[0].type,
        },
      },
    }));

    return new WorkflowResponse(result);
  },
);

export default createTenantWorkflow;
