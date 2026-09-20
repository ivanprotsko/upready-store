import type { MedusaContainer } from "@medusajs/framework";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

/**
 * Acceptance-only fixture (w19-mp-analytics): sets a known password for the
 * tenant owner of the scratch stand, so the seller dashboard can be opened in
 * the panel and curled. Scratch database only, never a live host.
 *
 *   npx medusa exec ./scripts/fixtures/w19-reset-owner-password.ts
 *
 * The email is read from `provider_identity` ON THE STAND rather than
 * remembered: w18's copy of this fixture carries `owner@cherkashino.example`
 * and this stand's row says `owner-cherkashino@example.test` (rule 17a).
 */
export default async function resetOwnerPassword({ container }: { container: MedusaContainer }) {
  const email = process.env.OWNER_EMAIL ?? "owner-cherkashino@example.test";
  const password = process.env.OWNER_PASSWORD ?? "w19-acceptance-scratch";
  const auth = container.resolve<IAuthModuleService>(Modules.AUTH);

  const result = await auth.updateProvider("emailpass", { entity_id: email, password });
  console.log("w19-reset-owner-password: updated", email, "success:", "authIdentity" in result);
}
