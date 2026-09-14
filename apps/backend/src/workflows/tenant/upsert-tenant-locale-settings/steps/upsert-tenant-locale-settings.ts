import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { TENANT_MODULE } from "../../../../modules/tenant";
import TenantModuleService from "../../../../modules/tenant/service";
import type { TenantLocaleSettingsDocument } from "../../../../api/tenants/locale-settings/validators";

export type UpsertTenantLocaleSettingsStepInput = {
  tenant_id: string;
} & TenantLocaleSettingsDocument;

type UpsertTenantLocaleSettingsCompensation = {
  id: string;
  previous: TenantLocaleSettingsDocument | null;
};

/**
 * The generated `TenantLocaleSettings` service types every `model.json()`
 * field as `Record<string, unknown>` — an array has no STRING index signature,
 * so `enabled_locales: string[]` needs this cast at every service call, in
 * (`toRow`) and out (`fromRow`), the same way `upsert-tenant-home` casts
 * `config` through `as unknown as TenantHomeDocument` on the way in.
 */
const toRow = (document: TenantLocaleSettingsDocument) => ({
  default_locale: document.default_locale,
  enabled_locales: document.enabled_locales as unknown as Record<string, unknown>,
  default_country: document.default_country,
});

const fromRow = (row: {
  default_locale: string;
  enabled_locales: unknown;
  default_country: string | null;
}): TenantLocaleSettingsDocument => ({
  default_locale: row.default_locale,
  enabled_locales: row.enabled_locales as unknown as string[],
  default_country: row.default_country ?? null,
});

/**
 * Writes the tenant's one `tenant_locale_settings` row, the same
 * update-or-create-with-compensation shape as `upsert-tenant-home`: a failed
 * run leaves the shop on exactly the locale defaults it had before.
 */
const upsertTenantLocaleSettingsStep = createStep(
  "upsert-tenant-locale-settings",
  async (
    { tenant_id, ...document }: UpsertTenantLocaleSettingsStepInput,
    { container },
  ) => {
    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    const [existing] = await tenantModuleService.listTenantLocaleSettings({ tenant_id });

    if (existing) {
      const previous = fromRow(existing);

      const [updated] = await tenantModuleService.updateTenantLocaleSettings([
        { id: existing.id, ...toRow(document) },
      ]);

      return new StepResponse<typeof updated, UpsertTenantLocaleSettingsCompensation>(
        updated,
        { id: existing.id, previous },
      );
    }

    const created = await tenantModuleService.createTenantLocaleSettings({
      tenant_id,
      ...toRow(document),
    });

    return new StepResponse<typeof created, UpsertTenantLocaleSettingsCompensation>(
      created,
      { id: created.id, previous: null },
    );
  },
  async (
    compensation: UpsertTenantLocaleSettingsCompensation | undefined,
    { container },
  ) => {
    if (!compensation) {
      return;
    }

    const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

    if (compensation.previous === null) {
      await tenantModuleService.deleteTenantLocaleSettings(compensation.id);
      return;
    }

    await tenantModuleService.updateTenantLocaleSettings([
      { id: compensation.id, ...toRow(compensation.previous) },
    ]);
  },
);

export default upsertTenantLocaleSettingsStep;
