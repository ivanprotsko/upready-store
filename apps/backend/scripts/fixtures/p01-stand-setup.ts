import type { MedusaContainer } from "@medusajs/framework";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";

import { TENANT_MODULE } from "../../src/modules/tenant";
import type TenantModuleService from "../../src/modules/tenant/service";
import { writeTenantSecretSlot } from "../../src/tenant-secrets/slot";

/**
 * Acceptance-only fixture (p01-settings-integrations-restructure). Scratch
 * database only, never a live host.
 *
 *   DATABASE_URL=…/upready_store_p01 npx medusa exec ./scripts/fixtures/p01-stand-setup.ts
 *
 * Two things the acceptance needs and the panel cannot create for itself:
 *
 * 1. a known password for the shop owner, read from `provider_identity` ON THE
 *    STAND rather than remembered (rule 17a, the lesson w19's fixture records);
 * 2. a Wildberries key STORED BEFORE the restructure. The acceptance criterion
 *    is that a key entered on the old screen is visible on the new hub, on
 *    `/settings/integrations/wildberries` and on
 *    `/settings/marketplaces/wildberries` WITHOUT being re-entered — «routes
 *    move, storage does not». Writing it through `writeTenantSecretSlot` is the
 *    same path the old form used, so the row is indistinguishable from one the
 *    owner saved a day earlier.
 *
 * The token is a FIXTURE, not a WB key: three base64url parts whose payload
 * carries the read-only bit and an expiry a year out, which is all
 * `inspectToken` decodes. Nothing here talks to Wildberries.
 */
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

const fixtureWbToken = (): string => {
  const payload = {
    id: "p01-stand",
    sid: "p01-seller",
    s: (1 << 30) | 1,
    exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    t: false,
    acc: 0,
  };
  return `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.p01-stand-signature-7788`;
};

export default async function p01StandSetup({ container }: { container: MedusaContainer }) {
  const handle = process.env.TENANT_HANDLE ?? "cherkashino";
  const email = process.env.OWNER_EMAIL ?? "owner-cherkashino@example.test";
  const password = process.env.OWNER_PASSWORD ?? "p01-acceptance-scratch";

  const auth = container.resolve<IAuthModuleService>(Modules.AUTH);
  const result = await auth.updateProvider("emailpass", { entity_id: email, password });
  console.log("p01: owner password set for", email, "success:", "authIdentity" in result);

  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = container.resolve<TenantModuleService>(TENANT_MODULE);

  const tenant = (await pg("tenant").select("id").where({ handle }).first()) as
    | { id: string }
    | undefined;
  if (!tenant) {
    throw new Error(`no tenant with handle ${handle} on this stand`);
  }

  const token = fixtureWbToken();
  const written = await writeTenantSecretSlot(pg, tenantModule, {
    tenantId: tenant.id,
    provider: "wildberries",
    credentials: { api_key: token },
    isEnabled: true,
  });
  // The last four characters are what every screen of the acceptance asserts;
  // the token itself is never printed.
  console.log(
    `p01: wildberries slot ${written.created ? "created" : "updated"} for ${handle}, last4=${token.slice(-4)}`,
  );
}
