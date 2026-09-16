import type { MedusaContainer } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { MARKETPLACE_WRITE_MODULE } from "../../src/modules/marketplace-write";
import type MarketplaceWriteModuleService from "../../src/modules/marketplace-write/service";
import { WB_MARKETPLACE } from "../../src/modules/wb-write/write-endpoints";
import { encryptJson, keyFromEnv } from "../../src/tenant-secrets/crypto";
import { WILDBERRIES_WRITE_SLOT } from "../../src/tenant-secrets/wildberries";

/**
 * Acceptance-only fixture (w21-wb-write-stocks-prices): opens gates (a), (b),
 * (c) and (d) on a SCRATCH stand so a `wb:push` run reaches gate (e) and
 * produces a `dry_run` audit row instead of stopping at "no credential".
 *
 * The same shape w20's own acceptance used. The credential is SYNTHETIC: the
 * signature is the literal `w21-acceptance-scratch` and the payload is one
 * this repository wrote, so it is a key WB would reject and this repository
 * would never send anyway — gate (e) reads `WB_WRITE_LIVE`, which nothing
 * sets.
 *
 * Scratch database only, never a live host. `W21_CLOSE=1` removes everything
 * it created, so the stand can be put back the way it was.
 *
 *   npx medusa exec ./scripts/fixtures/w21-open-stand-gates.ts
 *   W21_CLOSE=1 npx medusa exec ./scripts/fixtures/w21-open-stand-gates.ts
 */
export default async function openStandGates({ container }: { container: MedusaContainer }) {
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const service = container.resolve<MarketplaceWriteModuleService>(MARKETPLACE_WRITE_MODULE);

  const tenantId = process.env.W21_TENANT_ID ?? "ten_01M29Q4KYQHC70JZBENWZ8Z88M";
  const closing = process.env.W21_CLOSE === "1";

  if (closing) {
    await pg("tenant_integration_secret")
      .where({ tenant_id: tenantId, provider: WILDBERRIES_WRITE_SLOT })
      .del();

    const consents = (await service.listMarketplaceWriteConsents({
      tenant_id: tenantId,
      marketplace: WB_MARKETPLACE,
    })) as Array<{ id: string }>;
    for (const row of consents) {
      await service.deleteMarketplaceWriteConsents(row.id);
    }

    const settings = (await service.listMarketplaceWriteSettings({
      tenant_id: tenantId,
      marketplace: WB_MARKETPLACE,
    })) as Array<{ id: string }>;
    for (const row of settings) {
      await service.updateMarketplaceWriteSettings({ id: row.id, is_enabled: false });
    }

    console.log(
      `w21-open-stand-gates: closed — write slot deleted, ${consents.length} consent(s) revoked, switch off.`,
    );
    return;
  }

  // A JWT WB's own bit table reads as writable and unexpired: bit 30 clear,
  // `exp` a year out. `s` is the access mask, `t: false` says production.
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const apiKey = [
    part({ alg: "HS256", typ: "JWT" }),
    part({
      id: "w21-acceptance",
      s: 0,
      sid: "w21-seller",
      t: false,
      exp: Math.floor(Date.now() / 1000) + 365 * 24 * 3_600,
    }),
    "w21-acceptance-scratch",
  ].join(".");

  const payload = encryptJson({ api_key: apiKey }, keyFromEnv());

  await pg("tenant_integration_secret")
    .where({ tenant_id: tenantId, provider: WILDBERRIES_WRITE_SLOT })
    .del();

  await pg("tenant_integration_secret").insert({
    id: `tis_w21_${Date.now()}`,
    tenant_id: tenantId,
    provider: WILDBERRIES_WRITE_SLOT,
    payload,
    is_enabled: true,
    created_at: new Date(),
    updated_at: new Date(),
  });

  const [setting] = (await service.listMarketplaceWriteSettings({
    tenant_id: tenantId,
    marketplace: WB_MARKETPLACE,
  })) as Array<{ id: string }>;

  if (setting) {
    await service.updateMarketplaceWriteSettings({
      id: setting.id,
      is_enabled: true,
      updated_by: "fixture:w21",
    });
  } else {
    await service.createMarketplaceWriteSettings({
      tenant_id: tenantId,
      marketplace: WB_MARKETPLACE,
      is_enabled: true,
      updated_by: "fixture:w21",
    });
  }

  for (const opClass of ["stocks", "prices"] as const) {
    const [existing] = (await service.listMarketplaceWriteConsents({
      tenant_id: tenantId,
      marketplace: WB_MARKETPLACE,
      op_class: opClass,
    })) as Array<{ id: string }>;

    if (existing) {
      continue;
    }

    await service.createMarketplaceWriteConsents({
      tenant_id: tenantId,
      marketplace: WB_MARKETPLACE,
      op_class: opClass,
      confirmed_by: "fixture:w21",
      confirmed_at: new Date(),
      note: "acceptance fixture, scratch stand",
    });
  }

  console.log(
    "w21-open-stand-gates: opened (a)(b)(c)(d) for " +
      `${tenantId}; gate (e) WB_WRITE_LIVE stays unset, so a push can only journal a dry run.`,
  );
}
