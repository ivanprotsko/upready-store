import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { TENANT_MODULE } from "../modules/tenant";
import type TenantModuleService from "../modules/tenant/service";

/**
 * Seeds the `cherkashino` tenant's `tenant_requisites` row with the values
 * actually recorded for Оксана Черкашина's shop (t12-legal-requisites), from
 * `handoff/day-2026-09-16-oksana-store/research/chrxnasdmds-digest.md` §1
 * (row "Продавец"). Nothing here is invented: a value not present in that
 * digest is left out of `SEED`, and it stays out of the update, so it keeps
 * showing up in the panel's "не заполнено" list rather than being guessed.
 *
 * Left OUT on purpose, per the digest and the worker brief's "What NOT to
 * do":
 * - `legal_address` — the digest has only the city (Элиста); the street and
 *   index are unknown (`q-yur-adres-bez-ulicy`). A half address would read as
 *   a complete one, which is worse than an empty field.
 * - `email` / `dpo_email` — the only e-mail on file is the placeholder
 *   `olavka@example.com` (`q-realnyy-email-prodavca`), which is not a real
 *   seller address and must not be carried over.
 * - `rkn_notice_date` / `rkn_reg_number` — not recorded anywhere.
 *
 * `phone` IS seeded, with `phone_confirmed: false`: the digest records
 * `+7 (911) 718-01-23` itself as unconfirmed. The resolver
 * (`tenant-legal/requisites.ts`) withholds `{{ТЕЛЕФОН}}` until the owner
 * confirms it in the panel, so this seed cannot make an unverified number
 * read as settled on a public offer.
 *
 * Idempotent: a tenant whose row already carries a non-blank value for a
 * given field keeps it — this script only fills a field that is still empty,
 * so a second run (or a run after the owner has edited the panel) changes
 * nothing.
 *
 * `medusa exec` swallows a leading `--` before a flag (measured in
 * `backfill-tenant-locale-settings.ts`), so the dry-run switch is spelled
 * without dashes:
 *
 *   npx medusa exec ./src/scripts/prefill-cherkashino-requisites.ts
 *   npx medusa exec ./src/scripts/prefill-cherkashino-requisites.ts dry-run
 */
const TENANT_HANDLE = "cherkashino";

const SEED: Record<string, string> = {
  legal_name: "ИП Черкашина Оксана Ивановна",
  inn: "524900658999",
  ogrn: "309524933000032",
  return_address: "СДЭК, Элиста, Ленина 1",
  phone: "+7 (911) 718-01-23",
};

export default async function prefillCherkashinoRequisites({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const tenantModuleService: TenantModuleService = container.resolve(TENANT_MODULE);
  const dryRun = args.includes("dry-run") || args.includes("--dry-run");

  const [tenant] = await tenantModuleService.listTenants({ handle: TENANT_HANDLE });
  if (!tenant) {
    logger.info(`prefill-cherkashino-requisites: no tenant with handle "${TENANT_HANDLE}" — nothing to do.`);
    return;
  }

  const [existing] = await tenantModuleService.listTenantRequisites({ tenant_id: tenant.id });

  const patch: Record<string, string | boolean> = {};
  for (const [field, value] of Object.entries(SEED)) {
    const current = (existing as Record<string, unknown> | undefined)?.[field];
    if (typeof current === "string" && current.trim().length > 0) {
      continue;
    }
    patch[field] = value;
  }

  // The unconfirmed phone's own flag: only set it the first time this script
  // writes the phone, never overwrite an owner who already confirmed it.
  if (patch.phone !== undefined && !existing?.phone_confirmed) {
    patch.phone_confirmed = false;
  }

  if (!Object.keys(patch).length) {
    logger.info(
      `prefill-cherkashino-requisites: tenant "${TENANT_HANDLE}" already has every seeded field filled — nothing to write.`,
    );
    return;
  }

  if (dryRun) {
    logger.info(
      `prefill-cherkashino-requisites: [dry-run] would set on tenant "${TENANT_HANDLE}" (${tenant.id}): ${JSON.stringify(patch)}`,
    );
    return;
  }

  if (existing) {
    await tenantModuleService.updateTenantRequisites({ id: existing.id, ...patch });
  } else {
    await tenantModuleService.createTenantRequisites({ tenant_id: tenant.id, ...patch });
  }

  logger.info(
    `prefill-cherkashino-requisites: tenant "${TENANT_HANDLE}" (${tenant.id}) — set ${JSON.stringify(patch)}`,
  );
}
