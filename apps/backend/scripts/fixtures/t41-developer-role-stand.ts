import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../src/modules/tenant";
import type TenantModuleService from "../../src/modules/tenant/service";
import { markTestShopMetadata } from "../../src/modules/tenant/test-shop";
import addTenantAdminWorkflow from "../../src/workflows/tenant/add-tenant-admin";
import createTenantByAdminWorkflow from "../../src/workflows/tenant/create-tenant-by-admin";

/**
 * t-2026-10-14-41: a scratch shop shaped like the one Ivan saw on 14.10.2026,
 * for the acceptance of `src/scripts/assign-developer-role.ts` and the
 * screenshots of «Сотрудники». Run once against a scratch database, never
 * against a real one:
 *
 *   PLATFORM_ADMIN_EMAIL=app@t41-stand.test npx medusa exec ./scripts/fixtures/t41-developer-role-stand.ts
 *
 * The shop gets four OWNERS, as the read-only inventory of production found
 * them: the business's owner, the developer, an agent's service login and the
 * platform's row (made an owner again here, the role it had before this
 * task); then a manager and an operator. Every name and address is invented
 * (rule 5zf: a stand runs on synthetic data). Idempotent by handle.
 */
const HANDLE = "t41-stand";
const PASSWORD = "supersecret";

const LOGINS = [
  { email: "developer@t41-stand.test", first_name: "Иван", last_name: "Разработчиков", role: "owner" },
  { email: "ops@t41-stand.test", first_name: "Shop", last_name: "Ops", role: "owner" },
  { email: "manager@t41-stand.test", first_name: "Татьяна", last_name: "Орлова", role: "manager" },
  { email: "operator@t41-stand.test", first_name: "Кира", last_name: "Белова", role: "operator" },
] as const;

export default async function seedT41Stand({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

  const [existing] = await tenantModuleService.listTenants({ handle: HANDLE });
  if (existing) {
    logger.info(`t41-stand: ${HANDLE} already exists (${existing.id}), skipped.`);
    return;
  }

  const { result } = await createTenantByAdminWorkflow(container).run({
    input: {
      name: "Травы и чаи (стенд)",
      handle: HANDLE,
      admin: { email: "owner@t41-stand.test", password: PASSWORD, first_name: "Ольга", last_name: "Смирнова" },
    },
  });
  const tenantId = result.tenant.id;

  await tenantModuleService.updateTenants({
    id: tenantId,
    metadata: markTestShopMetadata(result.tenant.metadata as Record<string, unknown> | null),
  });

  for (const login of LOGINS) {
    await addTenantAdminWorkflow(container).run({
      input: { ...login, password: PASSWORD, tenant_id: tenantId },
    });
  }

  // Production's platform row is an owner; the new code makes it a developer
  // on creation, so the stand puts it back the way production has it.
  const platformEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim();
  if (platformEmail) {
    const [platformRow] = await tenantModuleService.listTenantAdmins({ email: platformEmail, tenant_id: tenantId });
    if (platformRow) {
      await tenantModuleService.updateTenantAdmins({ id: platformRow.id, role: "owner" });
    }
  }

  const rows = await tenantModuleService.listTenantAdmins({ tenant_id: tenantId });
  logger.info(
    `t41-stand: ${HANDLE} (${tenantId}) with ${rows.length} logins: ` +
      rows.map((row) => `${row.email} ${row.role}`).join(", "),
  );
}
