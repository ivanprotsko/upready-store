import type { MedusaContainer } from "@medusajs/framework";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

/**
 * Acceptance-only fixture (w13-wb-readonly-flag): sets a known password for
 * the tenant owner emailpass identity so `GET /tenants/wb/status` can be
 * curled on the local stand. Scratch database only, never run against a live
 * host.
 *
 *   npx medusa exec ./scripts/fixtures/w13-reset-owner-password.ts
 */
export default async function resetOwnerPassword({ container }: { container: MedusaContainer }) {
  const email = "owner-cherkashino@example.test";
  const password = "w13-acceptance-scratch";
  const auth = container.resolve<IAuthModuleService>(Modules.AUTH);

  const result = await auth.updateProvider("emailpass", { entity_id: email, password });
  console.log("w13-reset-owner-password: updated", email, "success:", "authIdentity" in result);
}
