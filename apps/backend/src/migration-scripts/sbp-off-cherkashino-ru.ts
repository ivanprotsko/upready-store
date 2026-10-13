import type { MedusaContainer } from "@medusajs/framework";
import type { Logger } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { Knex } from "@medusajs/framework/mikro-orm/knex";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";
import { readRobokassaSecret } from "../tenant-secrets/robokassa";
import { writeTenantSecretSlot } from "../tenant-secrets/slot";
import { sanitizeRobokassaAliases } from "../modules/payment-robokassa/payment-methods";
import { SBP_OFF_HOST, sbpOffPageBody, withSbpOff } from "./data/sbp-off";

/**
 * Switches SBP off on cherkashino.ru, once (t-2026-10-12-32). Ivan 12.10: «4.1. нужно выключить
 * оплату СБП»; 13.10: «я просил в upready-store убрать в магазине cherkashino.ru способ оплаты
 * СБП, но он до сих пор там.» The panel's switch for it (t-2026-10-12-13) was deployed on 12.10,
 * but nobody with a login to the live panel pressed it, and no agent has one. COO 13.10 13:25
 * chose a one-off data step run by the deploy.
 *
 * `medusa db:migrate` runs each file of this folder once per database (the deploy's entrypoint
 * runs it on RU and on INTL alike), so the script first finds the shop by its host and does
 * nothing where there is none:
 *
 * 1. Robokassa: the same write the panel's «Способы оплаты в Robokassa» makes, SBP added to
 *    `credentials.disabled_methods` (`PUT /tenants/payment-settings`), through the same
 *    `writeTenantSecretSlot`; every other credential, the mode and the switch stay as they are.
 *    The checkout's rows, the session's whitelist and the footer's marks all read that list.
 * 2. The pages that still offered SBP, «О магазине», «Доставка и оплата» and the offer's 5.3,
 *    lose exactly that wording (`data/sbp-off.ts`); a page reworded since is logged and kept.
 *
 * Nothing secret is logged: the account is named by its row id only. A failure is logged, not
 * thrown: the entrypoint runs `db:migrate` before the server starts, and a shop's payment
 * switch is not worth a backend that does not come up. The release's live check shows it.
 */
export default async function sbpOffCherkashinoRu({ container }: { container: MedusaContainer }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER) as Logger;
  try {
    await switchSbpOff(container, logger);
  } catch (error) {
    logger.error(
      `sbp-off-cherkashino-ru: failed, SBP left as it was: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function switchSbpOff(container: MedusaContainer, logger: Logger) {
  const pg = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const tenantModule = container.resolve<TenantModuleService>(TENANT_MODULE);
  const say = (message: string) => logger.info(`sbp-off-cherkashino-ru: ${message}`);

  const domain = (await pg("tenant_domain")
    .select("tenant_id")
    .where({ host: SBP_OFF_HOST })
    .whereNull("deleted_at")
    .first()) as { tenant_id: string } | undefined;
  if (!domain) {
    say(`no shop answers on ${SBP_OFF_HOST} in this database, nothing to do.`);
    return;
  }
  const tenantId = domain.tenant_id;

  // ---- 1. Robokassa --------------------------------------------------------------
  let secret: Awaited<ReturnType<typeof readRobokassaSecret>> = null;
  try {
    secret = await readRobokassaSecret(pg, tenantId, { includeDisabled: true });
  } catch (error) {
    // A row this key cannot decrypt (46df D1): the owner re-enters it in the panel; nothing to switch.
    say(`the Robokassa row of ${tenantId} does not decrypt here (${error instanceof Error ? error.name : "error"}), left as is.`);
  }
  if (!secret) {
    say(`${tenantId} has no Robokassa account here, nothing to switch off.`);
  } else {
    const disabled = withSbpOff(sanitizeRobokassaAliases(secret.credentials.disabled_methods));
    if (!disabled) {
      say(`SBP is already off for ${tenantId} (row ${secret.id}).`);
    } else {
      await writeTenantSecretSlot(pg, tenantModule, {
        tenantId,
        provider: "robokassa",
        credentials: { ...secret.credentials, disabled_methods: disabled },
      });
      say(`SBP switched off for ${tenantId} (row ${secret.id}); off now: ${disabled.join(", ")}.`);
    }
  }

  // ---- 2. The shop's pages ------------------------------------------------------
  const pages = (await tenantModule.listTenantPages({ tenant_id: tenantId })) as Array<{
    id: string;
    key: string;
    locale: string;
    body: string;
  }>;
  for (const page of pages) {
    const edit = sbpOffPageBody(page.key, page.body ?? "");
    const where = `page «${page.key}» (${page.locale})`;
    if (edit.outcome === "changed") {
      await tenantModule.updateTenantPages({ id: page.id, body: edit.body });
      say(`${where}: SBP taken out.`);
    } else if (edit.outcome === "different") {
      say(`${where}: still names SBP in words of its own, left for the owner.`);
    } else if (edit.outcome === "already") {
      say(`${where}: no SBP in it.`);
    }
  }
}
