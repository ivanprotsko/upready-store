import type { ExecArgs, Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  readManualPayment,
  storedManualPayment,
  type TenantManualPayment,
} from "../api/tenants/payment-settings/manual/manual-payment";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import { STUB_ID_PREFIX, STUB_REQUISITES } from "./stub-requisites/stubs";

/**
 * Stub transfer requisites for a shop (t-cherk-com-hotfix batch 6, Ivan
 * 03.10: «сделай заглушки разных банков, чтобы человек нажимал на пункт и ему
 * показывался номер»): six banks and two wallets (`stub-requisites/stubs.ts`),
 * holder «DEMO», numbers and addresses that fail their checksums so nobody can
 * pay to them. The method is switched on; the manager contacts are kept.
 *
 *   npx medusa exec ./src/scripts/seed-stub-requisites.js tenant=<handle>          (prints the plan, writes nothing)
 *   npx medusa exec ./src/scripts/seed-stub-requisites.js tenant=<handle> apply    (writes)
 *   live: docker exec mt-backend node_modules/.bin/medusa exec ./src/scripts/seed-stub-requisites.js tenant=cherkashino-com apply
 *
 * Idempotent: the stubs carry ids starting with `stub-`, and a rerun replaces
 * exactly those. A shop that already has requisites of its own is left alone
 * (the owner's numbers must never sit next to stubs) unless `with-own` is
 * passed, which puts the stubs after them.
 */
const readArg = (args: string[], name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

const listLines = (manual: TenantManualPayment): string[] => [
  `enabled: ${manual.enabled}`,
  ...manual.requisites.map((item, index) =>
    item.kind === "bank"
      ? `  ${index + 1}. [${item.id}] bank ${item.bank} (${item.icon ?? "no icon"}) ${item.number} ${item.holder ?? ""}`
      : `  ${index + 1}. [${item.id}] ${item.currency} ${item.network} ${item.address}`,
  ),
];

export default async function seedStubRequisites({ container, args = [] }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const apply = args.includes("apply");
  const withOwn = args.includes("with-own");
  const handle = readArg(args, "tenant");

  if (!handle) {
    throw new Error("seed-stub-requisites: pass tenant=<handle> (and apply to write)");
  }

  const {
    data: [tenant],
  } = await query.graph({ entity: "tenant", fields: ["id", "handle", "metadata"], filters: { handle } });

  if (!tenant) {
    throw new Error(`seed-stub-requisites: tenant "${handle}" was not found`);
  }

  const current = readManualPayment(tenant.metadata as Record<string, unknown> | null);
  const own = current.requisites.filter((item) => !item.id.startsWith(STUB_ID_PREFIX));

  if (own.length && !withOwn) {
    logger.warn(
      `seed-stub-requisites: ${handle} already has ${own.length} requisite(s) of its own; nothing written. Pass with-own to add the stubs after them.`,
    );
    for (const line of listLines(current)) {
      logger.info(line);
    }
    return;
  }

  const next: TenantManualPayment = {
    enabled: true,
    requisites: [...own, ...STUB_REQUISITES],
    contacts: current.contacts,
  };

  logger.info(`seed-stub-requisites: ${handle} (${tenant.id}) — before:`);
  for (const line of listLines(current)) {
    logger.info(line);
  }
  logger.info(`seed-stub-requisites: ${handle} — after${apply ? "" : " (dry run, nothing written; pass apply)"}:`);
  for (const line of listLines(next)) {
    logger.info(line);
  }

  if (!apply) {
    return;
  }

  const tenantModuleService = container.resolve<TenantModuleService>(TENANT_MODULE);
  const metadata = (tenant.metadata ?? {}) as Record<string, unknown>;
  await tenantModuleService.updateTenants({
    id: tenant.id as string,
    metadata: { ...metadata, manual_payment: storedManualPayment(next) },
  });

  logger.info(`seed-stub-requisites: wrote ${STUB_REQUISITES.length} stub requisite(s) to ${handle}, transfers switched on`);
}
