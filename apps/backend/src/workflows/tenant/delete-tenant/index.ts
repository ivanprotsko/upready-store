import { createWorkflow, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { revokeApiKeysWorkflow, updateSalesChannelsWorkflow } from "@medusajs/medusa/core-flows";
import archiveTenantStep from "./steps/archive-tenant";
import deleteTenantFilesStep from "./steps/delete-tenant-files";
import resolveTenantLinksStep from "./steps/resolve-tenant-links";

export type DeleteTenantWorkflowInput = {
  id: string;
  purge_files?: boolean;
};

/**
 * Soft delete (contract §4). Steps, in order, each compensating the one
 * before it on failure except the last:
 *
 * 1. `archive-tenant` — stamps `metadata.archived_at`.
 * 2. Disable the tenant's sales channel (`updateSalesChannelsWorkflow.runAsStep`).
 * 3. Revoke the tenant's publishable key (`revokeApiKeysWorkflow.runAsStep`);
 *    from then on the storefront's calls with that key answer `401`.
 * 4. Only when `purge_files` is true: `deleteTenantFilesStep` (owner W2). No
 *    compensation is possible for deleted files, which is why it is last and
 *    off by default.
 *
 * Login for the tenant's admins is closed by middleware reading
 * `metadata.archived_at`, not by touching auth identities here (contract
 * §4), so this workflow never resolves a `tenant_admin` and stays cheap to
 * compensate.
 */
const deleteTenantWorkflow = createWorkflow(
  "delete-tenant",
  function (input: DeleteTenantWorkflowInput) {
    const links = resolveTenantLinksStep({ id: input.id });
    const archived = archiveTenantStep({ id: input.id });

    when("delete-tenant-disable-channel", links, (data) => Boolean(data.sales_channel_id)).then(() => {
      const selector = transform({ links }, (data) => ({
        selector: { id: [data.links.sales_channel_id as string] },
        update: { is_disabled: true },
      }));

      updateSalesChannelsWorkflow.runAsStep({ input: selector });
    });

    when("delete-tenant-revoke-key", links, (data) => Boolean(data.api_key_id)).then(() => {
      const revoke = transform({ links }, (data) => ({
        selector: { id: [data.links.api_key_id as string] },
        revoke: { revoked_by: "delete-tenant-workflow" },
      }));

      revokeApiKeysWorkflow.runAsStep({ input: revoke });
    });

    when("delete-tenant-purge-files", input, (data) => Boolean(data.purge_files)).then(() => {
      deleteTenantFilesStep({ tenant_id: input.id });
    });

    return new WorkflowResponse(archived);
  },
);

export default deleteTenantWorkflow;
