import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import upsertTenantLocaleSettingsStep, {
  type UpsertTenantLocaleSettingsStepInput,
} from "./steps/upsert-tenant-locale-settings";

export type UpsertTenantLocaleSettingsWorkflowInput = UpsertTenantLocaleSettingsStepInput;

/** `PUT /tenants/locale-settings` (t06-locale-currency). One step, the same shape `upsert-tenant-home` uses. */
const upsertTenantLocaleSettingsWorkflow = createWorkflow(
  "upsert-tenant-locale-settings",
  (input: UpsertTenantLocaleSettingsWorkflowInput) => {
    const localeSettings = upsertTenantLocaleSettingsStep(input);

    return new WorkflowResponse(localeSettings);
  },
);

export default upsertTenantLocaleSettingsWorkflow;
