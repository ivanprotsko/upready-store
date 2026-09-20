import type { MedusaContainer } from "@medusajs/framework";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

/**
 * Acceptance-only fixture (w18-mp-reviews-desk): sets a known password for the
 * tenant owner of the scratch stand, so the desk can be opened in the panel
 * and curled. Scratch database only, never a live host.
 *
 *   npx medusa exec ./scripts/fixtures/w18-reset-owner-password.ts
 *
 * The email is the one this stand actually carries; `provider_identity` on the
 * stand is the source, not a remembered login (rule 17a).
 */
export default async function resetOwnerPassword({ container }: { container: MedusaContainer }) {
  const email = "owner@cherkashino.example";
  const password = "w18-acceptance-scratch";
  const auth = container.resolve<IAuthModuleService>(Modules.AUTH);

  const result = await auth.updateProvider("emailpass", { entity_id: email, password });
  console.log("w18-reset-owner-password: updated", email, "success:", "authIdentity" in result);
}
