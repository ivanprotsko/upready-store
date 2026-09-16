import type { MedusaContainer } from "@medusajs/framework";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

/**
 * Acceptance-only fixture (w14-mp-catalog-link): sets a known password for the
 * owner of a SCRATCH stand, so the panel and `/tenants/*` can be opened there.
 *
 * `w13-reset-owner-password.ts` does the same for one hard-coded address
 * (`owner-cherkashino@example.test`), which is not the address every scratch
 * database carries — the w12 stand's owner is `owner@cherkashino.example`, and
 * running w13's fixture against it reports success while changing nothing
 * (measured: `success: false`, then a 401 on login). The address is therefore
 * an input here, and the password is taken from the environment rather than
 * from an argument: an argument stands in the shell history and in `ps`.
 *
 *   W14_OWNER_EMAIL=owner@cherkashino.example W14_OWNER_PASSWORD=<pass> \
 *     npx medusa exec ./scripts/fixtures/w14-stand-owner-password.ts
 *
 * Scratch database only. It changes a credential and must never be pointed at
 * a live host.
 */
export default async function standOwnerPassword({ container }: { container: MedusaContainer }) {
  const email = process.env.W14_OWNER_EMAIL;
  const password = process.env.W14_OWNER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "w14-stand-owner-password: name the owner and the password in the environment: " +
        "W14_OWNER_EMAIL=<email> W14_OWNER_PASSWORD=<pass>",
    );
  }

  const auth = container.resolve<IAuthModuleService>(Modules.AUTH);
  const result = await auth.updateProvider("emailpass", { entity_id: email, password });

  /** The read-back, not a static «готово»: the CLI reports what it got (rule 20a). */
  console.log(
    `w14-stand-owner-password: ${email} — success: ${"success" in result ? result.success : false}`,
  );
}
