import type { MedusaContainer } from "@medusajs/framework";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

/**
 * Manual-verification-only fixture (o24-courses): sets a known password for
 * `owner-cherkashino@example.test` on `upready_store_e2e` so the tenant panel's
 * new /courses screen can be clicked through in a browser. Scratch/e2e database
 * only, never a live host — same shape as `w19-reset-owner-password.ts`.
 *
 *   npx medusa exec ./scripts/fixtures/o24-reset-owner-password.ts
 */
export default async function resetOwnerPassword({ container }: { container: MedusaContainer }) {
  const email = process.env.OWNER_EMAIL ?? "owner-cherkashino@example.test";
  const password = process.env.OWNER_PASSWORD ?? "o24-courses-manual-check";
  const auth = container.resolve<IAuthModuleService>(Modules.AUTH);

  const result = await auth.updateProvider("emailpass", { entity_id: email, password });
  console.log("o24-reset-owner-password: updated", email, "success:", "authIdentity" in result);
}
