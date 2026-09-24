import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../../src/modules/tenant";
import type TenantModuleService from "../../src/modules/tenant/service";
import { isTestShop, markTestShopMetadata } from "../../src/modules/tenant/test-shop";

/**
 * o25-hide-test-shops: stamps `metadata.test_shop = true` on every tenant
 * EXCEPT the handles named in `REAL_SHOP_HANDLES` (comma list). This is the
 * one-time catch-up for shops created before the flag existed — a shop
 * created afterward by `seed-tenants.ts`, `seed-mt-demo.ts` or a fixture that
 * makes a throwaway tenant sets the flag itself, at creation.
 *
 * Idempotent and one-directional: a tenant already marked, or one whose
 * handle is in `REAL_SHOP_HANDLES`, is left exactly as it is. Never unmarks
 * and never deletes — a handle dropped from `REAL_SHOP_HANDLES` on a later
 * run does not retroactively touch a shop this fixture already decided to
 * leave alone.
 *
 *   REAL_SHOP_HANDLES=cherkashino,olavka,olavka-ru npx medusa exec \
 *     ./scripts/fixtures/o25-mark-test-shops.ts
 */
export default async function markTestShops({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);

  const realHandles = new Set(
    (process.env.REAL_SHOP_HANDLES ?? "")
      .split(",")
      .map((handle) => handle.trim())
      .filter(Boolean),
  );

  if (realHandles.size === 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "o25-mark-test-shops: REAL_SHOP_HANDLES is not set (comma list of handles to leave unmarked).",
    );
  }

  const tenants = await tenantModuleService.listTenants({});
  const marked: string[] = [];
  const alreadyMarked: string[] = [];
  const leftReal: string[] = [];

  for (const tenant of tenants) {
    const metadata = (tenant.metadata as Record<string, unknown> | null) ?? null;

    if (realHandles.has(tenant.handle)) {
      leftReal.push(tenant.handle);
      continue;
    }

    if (isTestShop(metadata)) {
      alreadyMarked.push(tenant.handle);
      continue;
    }

    await tenantModuleService.updateTenants({
      id: tenant.id,
      metadata: markTestShopMetadata(metadata),
    });
    marked.push(tenant.handle);
  }

  logger.info(
    `o25-mark-test-shops: marked ${marked.length} tenant(s) as test [${marked.join(", ") || "—"}]; ` +
      `${alreadyMarked.length} already marked [${alreadyMarked.join(", ") || "—"}]; ` +
      `${leftReal.length} left as real [${leftReal.join(", ") || "—"}].`,
  );
}
